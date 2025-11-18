import { postReq } from './routes/postREQ';
import { getReq } from './routes/getREQ';
import { putReq } from './routes/putREQ';
import { patchReq } from './routes/patchREQ';
import { deleteReq } from './routes/deleteREQ';
import { setColor } from '../helpers/colors';
import { DataManager } from "../database/DataManager";
import { createServer, type ServerInstance } from '../runtime/server';
import { fileExists, readJsonFile } from '../runtime/file';
import type { NanoWarpConfig } from '../types/config';
import { generateOpenAPISpec, generateSwaggerUI } from '../openapi/generator';

// Server Class
export class Server {
    Port: number;
    DataManager: DataManager;
    Keys: Record<string, string>;
    Whitelist: string[];
    config: Required<NanoWarpConfig>;

    // API Key cache (configurable TTL)
    private apiKeyCache: {
        keys: Record<string, string>;
        whitelist: string[];
        lastLoaded: number;
    } | null = null;

    // Graceful shutdown
    private server: ServerInstance | null = null;
    private inflightRequests = 0;
    private isShuttingDown = false;

    constructor(_dataManager: DataManager, _config: Required<NanoWarpConfig>) {
        this.config = _config;
        this.Port = _config.port;
        this.DataManager = _dataManager;
        this.Keys = {};
        this.Whitelist = [];
    }

    async getAPIKeys() {
        // Check cache first (using configurable TTL)
        if (this.apiKeyCache && Date.now() - this.apiKeyCache.lastLoaded < this.config.cache.apiKeyTTL!) {
            this.Keys = this.apiKeyCache.keys;
            this.Whitelist = this.apiKeyCache.whitelist;
            return;
        }

        // Load from file
        const filePath = `${this.DataManager.DataTree.RootDirectory}/apikeys.json`;
        if (await fileExists(filePath)) {
            const data: any = await readJsonFile(filePath);
            this.Keys = data.keys || {};
            this.Whitelist = data.whitelist || [];

            // Update cache
            this.apiKeyCache = {
                keys: this.Keys,
                whitelist: this.Whitelist,
                lastLoaded: Date.now()
            };
        } else {
            // Reset to defaults if file doesn't exist
            this.Keys = {};
            this.Whitelist = [];

            // Update cache
            this.apiKeyCache = {
                keys: {},
                whitelist: [],
                lastLoaded: Date.now()
            };
        }
    }

    // Manual cache clear method (useful for hot-reloading API keys)
    clearAPIKeyCache() {
        this.apiKeyCache = null;
        console.log(setColor('API key cache cleared', 'yellow'));
    }

    async start() {
        let that = this;
        this.server = createServer({
            port: this.Port,
            fetch: async (request) => {
                // Reject new requests during shutdown
                if (this.isShuttingDown) {
                    return new Response('Server is shutting down', { status: 503 });
                }

                // Efficient path extraction using URL API
                const url = new URL(request.url);
                const path = url.pathname;
                const queryString = url.search;
                const fullPath = path + queryString;

                // Track in-flight requests
                this.inflightRequests++;

                try {
                    function pathMap(p: string) {
                        return p.split('/').filter(part => part !== '');
                    }
                    const pathParts = pathMap(path);

                    // Logging request details
                    if (this.config.logging) {
                        console.log(
                            `${setColor('Request: ', 'green')}${setColor(request.method, 'blue')} "${setColor(fullPath, 'cyan')}"`
                        );
                    }

                    await this.getAPIKeys();

                    // API key check only if keys are defined and path is not whitelisted
                    if (Object.keys(this.Keys).length > 0 && !this.Whitelist.includes(path)) {
                        const apiKey = request.headers.get('X-API-Key');
                        if (!apiKey || !this.Keys.hasOwnProperty(apiKey)) {
                            console.log(setColor('Unauthorized: Invalid or missing API key', 'red'));
                            return new Response('Unauthorized: Invalid or missing API key', { status: 401 });
                        }
                        const expirationDateStr = this.Keys[apiKey];
                        const expirationDate = new Date(expirationDateStr);
                        if (isNaN(expirationDate.getTime())) {
                            console.log(setColor('Invalid expiration date for API key', 'red'));
                            return new Response('Internal Server Error', { status: 500 });
                        }
                        const currentDate = new Date();
                        if (currentDate > expirationDate) {
                            console.log(setColor('Unauthorized: API key expired', 'red'));
                            return new Response('Unauthorized: API key expired', { status: 401 });
                        }
                    }

                    // Handle OpenAPI/Swagger routes (if enabled)
                    if (this.config.openapi.enabled) {
                        // Serve OpenAPI JSON spec
                        if (path === this.config.openapi.specPath!) {
                            try {
                                const spec = await generateOpenAPISpec(
                                    this.DataManager.DataTree.RootDirectory,
                                    this.config,
                                    request.headers.get('host') ? `http://${request.headers.get('host')}` : undefined
                                );
                                return new Response(JSON.stringify(spec, null, 2), {
                                    status: 200,
                                    headers: { 'Content-Type': 'application/json' }
                                });
                            } catch (error) {
                                console.error(setColor('Error generating OpenAPI spec:', 'red'), error);
                                return new Response('Error generating OpenAPI specification', { status: 500 });
                            }
                        }

                        // Serve Swagger UI HTML
                        if (path === this.config.openapi.uiPath) {
                            const html = generateSwaggerUI(this.config.openapi.specPath!);
                            return new Response(html, {
                                status: 200,
                                headers: { 'Content-Type': 'text/html' }
                            });
                        }
                    }

                    // Handle empty paths
                    if (pathParts.length === 0) {
                        return new Response('Invalid Path', { status: 400 });
                    }

                    // Route requests
                    const routePathParts = pathParts[0] === 'api' ? pathParts.slice(1) : pathParts;

                    switch (request.method) {
                        case 'GET':
                            return await getReq(routePathParts, request, that.DataManager, that.config);

                        case 'POST':
                            return await postReq(routePathParts, request, that.DataManager, that.config);

                        case 'PUT':
                            return await putReq(routePathParts, request, that.DataManager, that.config);

                        case 'PATCH':
                            return await patchReq(routePathParts, request, that.DataManager, that.config);

                        case 'DELETE':
                            return await deleteReq(routePathParts, request, that.DataManager, that.config);

                        default:
                            return new Response('Request Method Not Found', { status: 405, headers: {
                                'Allow': 'GET, POST, PUT, PATCH, DELETE'
                            }});
                    }
                } catch (error) {
                    console.error(setColor('Error processing request:', 'red'), error);
                    return new Response('Internal Server Error', { status: 500 });
                } finally {
                    // Decrement in-flight request counter
                    this.inflightRequests--;
                }
            },
        });

        console.log(setColor('API listening on port ' + this.Port, 'yellow'));
        console.log('--------------------------' + '\n');
    }

    // Graceful shutdown
    async stop() {
        if (this.config.logging) {
            console.log(setColor('\n🛑 Initiating graceful shutdown...', 'yellow'));
        }
        this.isShuttingDown = true;

        // Stop accepting new connections
        if (this.server) {
            this.server.stop();
        }

        // Wait for in-flight requests to complete (with configurable timeout)
        const maxWaitTime = this.config.timeout.shutdown!;
        const startTime = Date.now();

        while (this.inflightRequests > 0 && Date.now() - startTime < maxWaitTime) {
            if (this.config.logging) {
                console.log(setColor(`⏳ Waiting for ${this.inflightRequests} in-flight requests...`, 'yellow'));
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.inflightRequests > 0 && this.config.logging) {
            console.log(setColor(`⚠ Shutdown timeout - ${this.inflightRequests} requests still in-flight`, 'yellow'));
        }

        // Flush any pending database writes
        await this.DataManager.saveDataBase();

        if (this.config.logging) {
            console.log(setColor('✓ Server stopped gracefully', 'green'));
        }
    }
}