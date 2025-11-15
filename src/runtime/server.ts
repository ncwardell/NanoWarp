/**
 * Cross-Runtime HTTP Server
 *
 * @module runtime/server
 * @description Provides a unified HTTP server API that works across both Bun and Node.js.
 * Uses the Web Standards fetch API for request handling, making it compatible with
 * modern edge runtimes and frameworks.
 *
 * Features:
 * - Unified fetch-based API
 * - Automatic runtime detection
 * - Web Standards Request/Response objects
 * - Graceful shutdown support
 */

import { isBun } from './detect';
import http from 'node:http';

/**
 * Configuration options for creating an HTTP server
 */
export interface ServerOptions {
    /**
     * Port number to listen on
     */
    port: number;

    /**
     * Request handler using Web Standards fetch API
     *
     * @param request - Web Standards Request object
     * @returns Web Standards Response object or Promise resolving to one
     */
    fetch: (request: Request) => Promise<Response> | Response;
}

/**
 * Server instance with lifecycle control methods
 */
export interface ServerInstance {
    /**
     * Stop the server and close all connections
     */
    stop: () => void;
}

/**
 * Create an HTTP server using runtime-specific implementations
 *
 * - **Bun**: Uses `Bun.serve()` with native fetch handler
 * - **Node.js**: Uses `http.createServer()` with fetch adapter
 *
 * Both implementations use the same Web Standards Request/Response interface,
 * ensuring your code is portable across runtimes.
 *
 * @param options - Server configuration options
 * @returns Server instance with lifecycle control methods
 *
 * @example
 * ```typescript
 * const server = createServer({
 *   port: 3000,
 *   fetch: async (request) => {
 *     return new Response('Hello World!', {
 *       headers: { 'Content-Type': 'text/plain' }
 *     });
 *   }
 * });
 *
 * // Later, gracefully shutdown
 * server.stop();
 * ```
 */
export function createServer(options: ServerOptions): ServerInstance {
    if (isBun) {
        // @ts-ignore - Bun global
        return Bun.serve({
            port: options.port,
            fetch: options.fetch
        });
    } else {
        // Node.js implementation
        const server = http.createServer(async (req, res) => {
            try {
                // Convert Node.js request to Web Request
                const url = `http://${req.headers.host || 'localhost'}${req.url || '/'}`;

                // Collect request body
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                const body = Buffer.concat(chunks);

                // Create Web Request
                const headers = new Headers();
                for (const [key, value] of Object.entries(req.headers)) {
                    if (value !== undefined) {
                        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
                    }
                }

                const request = new Request(url, {
                    method: req.method,
                    headers: headers,
                    body: body.length > 0 ? body : undefined,
                });

                // Call the fetch handler
                const response = await options.fetch(request);

                // Convert Web Response to Node.js response
                res.statusCode = response.status;

                // Set headers
                response.headers.forEach((value, key) => {
                    res.setHeader(key, value);
                });

                // Send body
                if (response.body) {
                    const reader = response.body.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        res.write(value);
                    }
                }

                res.end();
            } catch (error) {
                console.error('Error handling request:', error);
                res.statusCode = 500;
                res.end('Internal Server Error');
            }
        });

        server.listen(options.port);

        return {
            stop: () => {
                server.close();
            }
        };
    }
}
