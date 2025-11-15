import { postReq } from './routes/postREQ';
import { getReq } from './routes/getREQ';
import { setColor } from '../helpers/colors';
import { DataManager } from "../database/DataManager";
import { createServer, type ServerInstance } from '../runtime/server';
import { fileExists, readJsonFile } from '../runtime/file';

// Server Class
export class Server {
    Port: number;
    DataManager: DataManager;
    Keys: Record<string, string>;
    Whitelist: string[];

    // API Key cache (60 second TTL)
    private apiKeyCache: {
        keys: Record<string, string>;
        whitelist: string[];
        lastLoaded: number;
    } | null = null;
    private readonly API_KEY_CACHE_TTL = 60000; // 60 seconds

    // Graceful shutdown
    private server: ServerInstance | null = null;
    private inflightRequests = 0;
    private isShuttingDown = false;

    // Rate limiting (token bucket algorithm)
    private rateLimiter = new Map<string, { tokens: number; lastRefill: number }>();
    private readonly RATE_LIMIT_TOKENS = 100; // Max tokens per bucket
    private readonly RATE_LIMIT_REFILL = 10;  // Tokens added per second
    private readonly RATE_LIMIT_WINDOW = 1000; // Refill interval (1 second)

    constructor(_dataManager: DataManager, _port: number) {
        this.Port = _port;
        this.DataManager = _dataManager;
        this.Keys = {};
        this.Whitelist = [];
    }

    async getAPIKeys() {
        // Check cache first
        if (this.apiKeyCache && Date.now() - this.apiKeyCache.lastLoaded < this.API_KEY_CACHE_TTL) {
            this.Keys = this.apiKeyCache.keys;
            this.Whitelist = this.apiKeyCache.whitelist;
            return;
        }

        // Load from file
        const filePath = `${this.DataManager.DataTree.RootDirectory}/apikeys.json`;
        if (await fileExists(filePath)) {
            const data = await readJsonFile(filePath);
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

    // Check rate limit using token bucket algorithm
    checkRateLimit(ip: string): boolean {
        const now = Date.now();
        let bucket = this.rateLimiter.get(ip);

        if (!bucket) {
            // Create new bucket with full tokens
            bucket = { tokens: this.RATE_LIMIT_TOKENS - 1, lastRefill: now };
            this.rateLimiter.set(ip, bucket);
            return true;
        }

        // Calculate tokens to add based on time elapsed
        const timeElapsed = now - bucket.lastRefill;
        const tokensToAdd = Math.floor(timeElapsed / this.RATE_LIMIT_WINDOW) * this.RATE_LIMIT_REFILL;

        if (tokensToAdd > 0) {
            bucket.tokens = Math.min(this.RATE_LIMIT_TOKENS, bucket.tokens + tokensToAdd);
            bucket.lastRefill = now;
        }

        // Check if we have tokens available
        if (bucket.tokens > 0) {
            bucket.tokens--;
            return true;
        }

        return false;
    }

    // Clean up old rate limiter entries (prevent memory leak)
    cleanupRateLimiter() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        for (const [ip, bucket] of this.rateLimiter.entries()) {
            if (now - bucket.lastRefill > maxAge) {
                this.rateLimiter.delete(ip);
            }
        }
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

                // Rate limiting check
                const clientIP = request.headers.get('x-forwarded-for') ||
                                request.headers.get('x-real-ip') ||
                                'unknown';

                if (!this.checkRateLimit(clientIP)) {
                    console.log(setColor(`Rate limit exceeded for ${clientIP}`, 'red'));
                    return new Response('Too Many Requests', { status: 429 });
                }

                // Track in-flight requests
                this.inflightRequests++;

                try {
                    // Efficient path extraction using URL API
                    const url = new URL(request.url);
                    const path = url.pathname;
                    function pathMap() {
                        return path.split('/').filter(part => part !== '');
                    }
                    const pathParts = pathMap();

                    // Logging request details
                    console.log(
                        `${setColor('Request: ', 'green')}${setColor(request.method, 'blue')} "${setColor(path, 'cyan')}"`
                    );

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

                    // Handle empty paths
                    if (pathParts.length === 0) {
                        return new Response('Invalid Path', { status: 400 });
                    }

                    // Route requests
                    switch (request.method) {
                        case 'GET':
                            if (pathParts[0] === 'api') {
                                return await getReq(pathParts.slice(1), request, that.DataManager);
                            } else {
                                return await getReq(pathParts, request, that.DataManager);
                            }

                        case 'POST':
                            if (pathParts[0] === 'api') {
                                return await postReq(pathParts.slice(1), request, that.DataManager);
                            } else {
                                return await postReq(pathParts, request, that.DataManager);
                            }

                        default:
                            return new Response('Request Method Not Found', { status: 404 });
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

        // Periodic cleanup of rate limiter (every 5 minutes)
        setInterval(() => {
            this.cleanupRateLimiter();
        }, 5 * 60 * 1000);

        console.log(setColor('API listening on port ' + this.Port, 'yellow'));
        console.log('--------------------------' + '\n');
    }

    // Graceful shutdown
    async stop() {
        console.log(setColor('\n🛑 Initiating graceful shutdown...', 'yellow'));
        this.isShuttingDown = true;

        // Stop accepting new connections
        if (this.server) {
            this.server.stop();
        }

        // Wait for in-flight requests to complete (with timeout)
        const maxWaitTime = 30000; // 30 seconds
        const startTime = Date.now();

        while (this.inflightRequests > 0 && Date.now() - startTime < maxWaitTime) {
            console.log(setColor(`⏳ Waiting for ${this.inflightRequests} in-flight requests...`, 'yellow'));
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.inflightRequests > 0) {
            console.log(setColor(`⚠ Shutdown timeout - ${this.inflightRequests} requests still in-flight`, 'yellow'));
        }

        // Flush any pending database writes
        await this.DataManager.saveDataBase();

        console.log(setColor('✓ Server stopped gracefully', 'green'));
    }
}