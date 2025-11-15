/**
 * Configuration options for NanoWarp server
 *
 * @module Config
 */

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
    /**
     * Maximum number of tokens per IP address
     * @default 100
     */
    maxTokens?: number;

    /**
     * Number of tokens to refill per second
     * @default 10
     */
    refillRate?: number;

    /**
     * Refill interval in milliseconds
     * @default 1000
     */
    refillInterval?: number;

    /**
     * Per-endpoint rate limit overrides
     * Map of endpoint path to custom rate limit config
     *
     * @example
     * ```typescript
     * {
     *   '/auth/login': { maxTokens: 5, refillRate: 1 },
     *   '/api/heavy': { maxTokens: 10, refillRate: 2 }
     * }
     * ```
     */
    perEndpoint?: Record<string, {
        maxTokens?: number;
        refillRate?: number;
        refillInterval?: number;
    }>;

    /**
     * Enable or disable rate limiting entirely
     * @default true
     */
    enabled?: boolean;
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
     * Rate limiting configuration
     */
    rateLimit?: RateLimitConfig;

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
    rateLimit: {
        maxTokens: 100,
        refillRate: 10,
        refillInterval: 1000,
        perEndpoint: {},
        enabled: true,
    },
    cache: {
        apiKeyTTL: 60000,
        moduleCacheSize: 100,
    },
    timeout: {
        request: 30000,
        shutdown: 30000,
    },
    openapi: {
        enabled: true,
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
        rateLimit: {
            maxTokens: userConfig.rateLimit?.maxTokens ?? DEFAULT_CONFIG.rateLimit.maxTokens,
            refillRate: userConfig.rateLimit?.refillRate ?? DEFAULT_CONFIG.rateLimit.refillRate,
            refillInterval: userConfig.rateLimit?.refillInterval ?? DEFAULT_CONFIG.rateLimit.refillInterval,
            perEndpoint: userConfig.rateLimit?.perEndpoint ?? DEFAULT_CONFIG.rateLimit.perEndpoint,
            enabled: userConfig.rateLimit?.enabled ?? DEFAULT_CONFIG.rateLimit.enabled,
        },
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
