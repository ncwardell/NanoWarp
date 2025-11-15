/**
 * Health check endpoint
 *
 * URL: GET /health
 * Returns: Server health status
 */

import type { EndpointRateLimitConfig, EndpointSchema } from 'nanowarp';

// Configure rate limiting for this endpoint
export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 100,
    refillRate: 50,
    refillInterval: 1000,
};

// OpenAPI schema definition
export const schema: EndpointSchema = {
    summary: 'Health check',
    description: 'Returns the current health status of the server',
    tags: ['Utility'],
    responses: {
        '200': {
            description: 'Server is healthy',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            status: { type: 'string', example: 'healthy' },
                            uptime: { type: 'number', example: 12345.67 },
                            timestamp: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
                        },
                    },
                    example: {
                        status: 'healthy',
                        uptime: 12345.67,
                        timestamp: '2024-01-15T10:30:00.000Z',
                    },
                },
            },
        },
    },
};

export const execute = async (path: string, request: Request, Database: any) => {
    const healthStatus = {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(healthStatus, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
