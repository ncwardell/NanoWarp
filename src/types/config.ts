/**
 * Configuration options for NanoWarp server
 *
 * @module Config
 */

/**
 * Rate limiting configuration for individual endpoints
 * Define this in your endpoint file to control rate limiting
 */
export interface EndpointRateLimitConfig {
    /**
     * Maximum number of tokens per IP address
     * @default 100
     */
    maxTokens?: number;

    /**
     * Number of tokens to refill per interval
     * @default 10
     */
    refillRate?: number;

    /**
     * Refill interval in milliseconds
     * @default 1000
     */
    refillInterval?: number;

    /**
     * Enable or disable rate limiting for this endpoint
     * @default true
     */
    enabled?: boolean;
}

/**
 * OpenAPI schema definition for an endpoint
 * Define this in your endpoint file to document your API
 */
export interface EndpointSchema {
    /**
     * Endpoint summary (brief description)
     */
    summary?: string;

    /**
     * Detailed description
     */
    description?: string;

    /**
     * Tags for grouping endpoints
     */
    tags?: string[];

    /**
     * Request body schema (for POST/PUT/PATCH)
     */
    requestBody?: {
        description?: string;
        required?: boolean;
        content: {
            [mediaType: string]: {
                schema: any;
                example?: any;
            };
        };
    };

    /**
     * Response schemas by status code
     */
    responses?: {
        [statusCode: string]: {
            description: string;
            content?: {
                [mediaType: string]: {
                    schema: any;
                    example?: any;
                };
            };
        };
    };

    /**
     * Query parameters
     */
    parameters?: Array<{
        name: string;
        in: 'query' | 'path' | 'header';
        description?: string;
        required?: boolean;
        schema: any;
    }>;

    /**
     * Security requirements (overrides default)
     */
    security?: Array<Record<string, string[]>>;
}

/**
 * API key caching configuration
 */
export interface CacheConfig {
    /**
     * API key cache TTL in milliseconds
     * @default 60000 (60 seconds)
     */
    apiKeyTTL?: number;

    /**
     * Module cache maximum size (LRU)
     * @default 100
     */
    moduleCacheSize?: number;
}

/**
 * Request timeout configuration
 */
export interface TimeoutConfig {
    /**
     * Request timeout in milliseconds
     * @default 30000 (30 seconds)
     */
    request?: number;

    /**
     * Graceful shutdown timeout in milliseconds
     * @default 30000 (30 seconds)
     */
    shutdown?: number;
}

/**
 * OpenAPI/Swagger documentation configuration
 */
export interface OpenAPIConfig {
    /**
     * Enable OpenAPI documentation generation
     * @default true
     */
    enabled?: boolean;

    /**
     * Path to serve OpenAPI JSON spec
     * @default '/openapi.json'
     */
    specPath?: string;

    /**
     * Path to serve Swagger UI
     * @default '/docs'
     */
    uiPath?: string;

    /**
     * OpenAPI metadata
     */
    info?: {
        title?: string;
        version?: string;
        description?: string;
        contact?: {
            name?: string;
            email?: string;
            url?: string;
        };
        license?: {
            name?: string;
            url?: string;
        };
    };

    /**
     * Server information for OpenAPI spec
     */
    servers?: Array<{
        url: string;
        description?: string;
    }>;
}

/**
 * CORS configuration.
 *
 * Off by default. Set `cors: true` for permissive defaults (`origin: '*'`),
 * or pass an object for fine-grained control.
 */
export type CorsConfig = boolean | {
    /** Allowed origin(s). String, list, predicate, or '*'. Default: '*' */
    origin?: string | string[] | ((origin: string | null) => boolean);
    /** Allowed methods. Default: GET, POST, PUT, PATCH, DELETE, OPTIONS */
    methods?: string[];
    /** Allowed request headers. Default: ['Content-Type', 'X-API-Key'] */
    headers?: string[];
    /** Headers exposed to the client. Default: [] */
    exposeHeaders?: string[];
    /** Send Access-Control-Allow-Credentials: true. Default: false */
    credentials?: boolean;
    /** Cache preflight for N seconds. Default: 600 */
    maxAge?: number;
};

/**
 * Middleware hooks. before-handlers run before routing; after-handlers run
 * after the endpoint produces a response. Either may short-circuit by
 * returning a Response.
 */
export type BeforeHandler = (request: Request) => Promise<Response | void> | Response | void;
export type AfterHandler = (request: Request, response: Response) => Promise<Response | void> | Response | void;

export interface MiddlewareConfig {
    /** Functions to run before routing. Returning a Response short-circuits. */
    before?: BeforeHandler[];
    /** Functions to run after the endpoint. Returning a Response replaces the original. */
    after?: AfterHandler[];
}

/**
 * /metrics endpoint configuration. Off by default.
 */
export interface MetricsConfig {
    /** Enable the metrics endpoint. Default: false */
    enabled?: boolean;
    /** Path the metrics endpoint is served at. Default: '/metrics' */
    path?: string;
}

/**
 * Request body size limit configuration.
 *
 * When set, requests with bodies exceeding the limit are rejected with 413.
 * Default: unlimited (preserves existing behavior).
 */
export interface BodyLimitConfig {
    /** Maximum request body size in bytes. Default: undefined (unlimited). */
    maxBytes?: number;
}

/**
 * Database backend configuration.
 *
 * NanoWarp's data store is pluggable behind the `Database.retrieveData`,
 * `Database.saveData`, and `Database.deleteData` API. Endpoint code is
 * unchanged regardless of which backend is selected.
 */
export interface DatabaseConfig {
    /**
     * Backend to use for endpoint data ops.
     *
     * - `filesystem` (default): files on disk; matches historical behavior.
     * - `sqlite`: a single SQLite database file.
     * - `postgres`: a Postgres database (requires `pg` to be installed).
     *
     * Endpoint code is identical regardless of which backend is selected.
     *
     * @default 'filesystem'
     */
    backend?: 'filesystem' | 'sqlite' | 'postgres';

    /**
     * SQLite-specific options (only used when backend === 'sqlite').
     */
    sqlite?: {
        /**
         * Path to the SQLite database file.
         * @default `${dataPath}/data.db`
         */
        path?: string;
    };

    /**
     * Postgres-specific options (only used when backend === 'postgres').
     */
    postgres?: {
        /**
         * Postgres connection string, e.g.
         * `postgres://user:password@host:5432/dbname`
         */
        connectionString?: string;
        /**
         * Table to store the kv rows in. Default: 'nanowarp_kv'.
         */
        tableName?: string;
    };
}

/**
 * Complete NanoWarp configuration
 */
export interface NanoWarpConfig {
    /**
     * Port number for the HTTP server
     * @default 3000
     */
    port?: number;

    /**
     * Path to the data directory
     * @default './Database'
     */
    dataPath?: string;

    /**
     * Caching configuration
     */
    cache?: CacheConfig;

    /**
     * Timeout configuration
     */
    timeout?: TimeoutConfig;

    /**
     * OpenAPI/Swagger configuration
     */
    openapi?: OpenAPIConfig;

    /**
     * Database backend configuration.
     */
    database?: DatabaseConfig;

    /**
     * CORS configuration. Off by default — set to `true` for permissive
     * defaults or an object for fine-grained control.
     */
    cors?: CorsConfig;

    /**
     * Global middleware hooks (run for every request).
     */
    middleware?: MiddlewareConfig;

    /**
     * Built-in /metrics endpoint. Off by default.
     */
    metrics?: MetricsConfig;

    /**
     * Request body size limit. Default: unlimited.
     */
    bodyLimit?: BodyLimitConfig;

    /**
     * Enable or disable request logging
     * @default true
     */
    logging?: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<NanoWarpConfig> = {
    port: 3000,
    dataPath: './Database',
    cache: {
        apiKeyTTL: 60000,
        moduleCacheSize: 100,
    },
    timeout: {
        request: 30000,
        shutdown: 30000,
    },
    openapi: {
        enabled: false,
        specPath: '/openapi.json',
        uiPath: '/docs',
        info: {
            title: 'NanoWarp API',
            version: '1.0.0',
            description: 'API built with NanoWarp',
        },
        servers: [],
    },
    database: {
        backend: 'filesystem',
        sqlite: {},
        postgres: {},
    },
    cors: false,
    middleware: { before: [], after: [] },
    metrics: { enabled: false, path: '/metrics' },
    bodyLimit: {},
    logging: true,
};

/**
 * Merge user config with defaults
 */
export function mergeConfig(userConfig?: NanoWarpConfig): Required<NanoWarpConfig> {
    if (!userConfig) return DEFAULT_CONFIG;

    return {
        port: userConfig.port ?? DEFAULT_CONFIG.port,
        dataPath: userConfig.dataPath ?? DEFAULT_CONFIG.dataPath,
        cache: {
            apiKeyTTL: userConfig.cache?.apiKeyTTL ?? DEFAULT_CONFIG.cache.apiKeyTTL,
            moduleCacheSize: userConfig.cache?.moduleCacheSize ?? DEFAULT_CONFIG.cache.moduleCacheSize,
        },
        timeout: {
            request: userConfig.timeout?.request ?? DEFAULT_CONFIG.timeout.request,
            shutdown: userConfig.timeout?.shutdown ?? DEFAULT_CONFIG.timeout.shutdown,
        },
        openapi: {
            enabled: userConfig.openapi?.enabled ?? DEFAULT_CONFIG.openapi.enabled,
            specPath: userConfig.openapi?.specPath ?? DEFAULT_CONFIG.openapi.specPath,
            uiPath: userConfig.openapi?.uiPath ?? DEFAULT_CONFIG.openapi.uiPath,
            info: {
                title: userConfig.openapi?.info?.title ?? DEFAULT_CONFIG.openapi.info!.title!,
                version: userConfig.openapi?.info?.version ?? DEFAULT_CONFIG.openapi.info!.version!,
                description: userConfig.openapi?.info?.description ?? DEFAULT_CONFIG.openapi.info!.description,
                contact: userConfig.openapi?.info?.contact ?? DEFAULT_CONFIG.openapi.info!.contact,
                license: userConfig.openapi?.info?.license ?? DEFAULT_CONFIG.openapi.info!.license,
            },
            servers: userConfig.openapi?.servers ?? DEFAULT_CONFIG.openapi.servers,
        },
        database: {
            backend: userConfig.database?.backend ?? DEFAULT_CONFIG.database.backend,
            sqlite: {
                path: userConfig.database?.sqlite?.path ?? DEFAULT_CONFIG.database.sqlite?.path,
            },
            postgres: {
                connectionString: userConfig.database?.postgres?.connectionString,
                tableName: userConfig.database?.postgres?.tableName,
            },
        },
        cors: userConfig.cors ?? DEFAULT_CONFIG.cors,
        middleware: {
            before: userConfig.middleware?.before ?? [],
            after: userConfig.middleware?.after ?? [],
        },
        metrics: {
            enabled: userConfig.metrics?.enabled ?? DEFAULT_CONFIG.metrics.enabled,
            path: userConfig.metrics?.path ?? DEFAULT_CONFIG.metrics.path,
        },
        bodyLimit: {
            maxBytes: userConfig.bodyLimit?.maxBytes,
        },
        logging: userConfig.logging ?? DEFAULT_CONFIG.logging,
    };
}
