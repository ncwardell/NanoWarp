import { postReq } from './routes/postREQ';
import { getReq } from './routes/getREQ';
import { putReq } from './routes/putREQ';
import { patchReq } from './routes/patchREQ';
import { deleteReq } from './routes/deleteREQ';
import { setColor } from '../helpers/colors';
import { DataManager } from "../database/DataManager";
import { createServer, type ServerInstance } from '../runtime/server';
import { fileExists, readJsonFile } from '../runtime/file';
import type { NanoWarpConfig, BeforeHandler, AfterHandler } from '../types/config';
import { generateOpenAPISpec, generateSwaggerUI } from '../openapi/generator';
import { corsMiddleware } from './cors';
import { Metrics } from './metrics';

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

    // Cached OpenAPI spec — regenerated on a TTL to avoid re-importing every
    // endpoint module on each /openapi.json hit.
    private openapiCache: { spec: any; lastBuilt: number } | null = null;
    private static readonly OPENAPI_CACHE_TTL_MS = 60_000;

    // Compiled middleware chains (built once at start()).
    private beforeChain: BeforeHandler[] = [];
    private afterChain: AfterHandler[] = [];

    // Metrics (only populated when config.metrics.enabled).
    private metrics: Metrics | null = null;

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

    /**
     * Generate (or return cached) OpenAPI spec.
     * @private
     */
    private async getOpenAPISpec(host: string | undefined): Promise<any> {
        const now = Date.now();
        if (this.openapiCache && now - this.openapiCache.lastBuilt < Server.OPENAPI_CACHE_TTL_MS) {
            return this.openapiCache.spec;
        }
        const spec = await generateOpenAPISpec(
            this.DataManager.DataTree.RootDirectory,
            this.config,
            host ? `http://${host}` : undefined
        );
        this.openapiCache = { spec, lastBuilt: now };
        return spec;
    }

    async start() {
        let that = this;

        // Build middleware chain. CORS (when enabled) prepends to before; the
        // matching response-header pass appends to after.
        const userBefore = this.config.middleware?.before ?? [];
        const userAfter = this.config.middleware?.after ?? [];
        const cors = corsMiddleware(this.config.cors);
        this.beforeChain = cors ? [cors.before, ...userBefore] : [...userBefore];
        this.afterChain = cors ? [...userAfter, cors.after] : [...userAfter];

        // Metrics
        if (this.config.metrics?.enabled) {
            this.metrics = new Metrics();
        }

        this.server = createServer({
            port: this.Port,
            maxBodyBytes: this.config.bodyLimit?.maxBytes,
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
                let response: Response;

                try {
                    response = await this.handleRequest(request, path, fullPath);

                    // Run after-middleware
                    for (const fn of this.afterChain) {
                        const result = await fn(request, response);
                        if (result instanceof Response) response = result;
                    }
                } catch (error) {
                    console.error(setColor('Error processing request:', 'red'), error);
                    response = new Response('Internal Server Error', { status: 500 });
                } finally {
                    this.inflightRequests--;
                }

                this.metrics?.record(request.method, response.status);
                return response;
            },
        });

        console.log(setColor('API listening on port ' + this.Port, 'yellow'));
        console.log('--------------------------' + '\n');
    }

    /**
     * Inner request pipeline: before-middleware → logging → auth → built-in
     * routes (OpenAPI, /metrics) → endpoint dispatch.
     *
     * @private
     */
    private async handleRequest(request: Request, path: string, fullPath: string): Promise<Response> {
        // Before-middleware (CORS preflight lives here — must run before auth).
        for (const fn of this.beforeChain) {
            const result = await fn(request);
            if (result instanceof Response) return result;
        }

        if (this.config.logging) {
            console.log(
                `${setColor('Request: ', 'green')}${setColor(request.method, 'blue')} "${setColor(fullPath, 'cyan')}"`
            );
        }

        await this.getAPIKeys();

        // API key check only if keys are defined and path is not whitelisted.
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
            if (new Date() > expirationDate) {
                console.log(setColor('Unauthorized: API key expired', 'red'));
                return new Response('Unauthorized: API key expired', { status: 401 });
            }
        }

        // Built-in /metrics endpoint.
        if (this.metrics && path === this.config.metrics.path) {
            const snapshot = this.metrics.snapshot(this.inflightRequests);
            return new Response(JSON.stringify(snapshot, null, 2), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // OpenAPI / Swagger UI.
        if (this.config.openapi.enabled) {
            if (path === this.config.openapi.specPath!) {
                try {
                    const spec = await this.getOpenAPISpec(request.headers.get('host') ?? undefined);
                    return new Response(JSON.stringify(spec, null, 2), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' },
                    });
                } catch (error) {
                    console.error(setColor('Error generating OpenAPI spec:', 'red'), error);
                    return new Response('Error generating OpenAPI specification', { status: 500 });
                }
            }
            if (path === this.config.openapi.uiPath) {
                const html = generateSwaggerUI(this.config.openapi.specPath!);
                return new Response(html, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html' },
                });
            }
        }

        const pathParts = path.split('/').filter(part => part !== '');
        if (pathParts.length === 0) {
            return new Response('Invalid Path', { status: 400 });
        }

        const routePathParts = pathParts[0] === 'api' ? pathParts.slice(1) : pathParts;

        switch (request.method) {
            case 'GET': return await getReq(routePathParts, request, this.DataManager, this.config);
            case 'POST': return await postReq(routePathParts, request, this.DataManager, this.config);
            case 'PUT': return await putReq(routePathParts, request, this.DataManager, this.config);
            case 'PATCH': return await patchReq(routePathParts, request, this.DataManager, this.config);
            case 'DELETE': return await deleteReq(routePathParts, request, this.DataManager, this.config);
            default:
                return new Response('Request Method Not Found', {
                    status: 405,
                    headers: { 'Allow': 'GET, POST, PUT, PATCH, DELETE' },
                });
        }
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