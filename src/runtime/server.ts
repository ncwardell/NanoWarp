// HTTP server abstraction layer
import { isBun } from './detect';
import http from 'node:http';

export interface ServerOptions {
    port: number;
    fetch: (request: Request) => Promise<Response> | Response;
}

export interface ServerInstance {
    stop: () => void;
}

/**
 * Create an HTTP server (works in both Bun and Node.js)
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
