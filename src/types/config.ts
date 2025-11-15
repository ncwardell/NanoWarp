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
     * @default './data'
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
    dataPath: './data',
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
        logging: userConfig.logging ?? DEFAULT_CONFIG.logging,
    };
}
