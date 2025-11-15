/**
 * Server information endpoint
 *
 * URL: GET /info
 * Returns: Detailed server information including runtime and memory usage
 */

import type { EndpointRateLimitConfig, EndpointSchema } from 'nanowarp';

// Configure rate limiting for this endpoint
export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 50,
    refillRate: 10,
    refillInterval: 1000,
};

// OpenAPI schema definition
export const schema: EndpointSchema = {
    summary: 'Server information',
    description: 'Returns detailed information about the server including runtime, version, and memory usage',
    tags: ['Utility'],
    responses: {
        '200': {
            description: 'Server information retrieved successfully',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            version: { type: 'string', example: '1.0.0' },
                            runtime: { type: 'string', example: 'Bun' },
                            uptime: { type: 'number', example: 12345.67 },
                            timestamp: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
                            memory: {
                                type: 'object',
                                properties: {
                                    rss: { type: 'number' },
                                    heapTotal: { type: 'number' },
                                    heapUsed: { type: 'number' },
                                    external: { type: 'number' },
                                },
                            },
                            platform: { type: 'string', example: 'linux' },
                        },
                    },
                },
            },
        },
    },
};

export const execute = async (path: string, request: Request, Database: any) => {
    const info = {
        version: '1.0.0',
        runtime: typeof Bun !== 'undefined' ? 'Bun' : 'Node.js',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version,
    };

    return new Response(JSON.stringify(info, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
