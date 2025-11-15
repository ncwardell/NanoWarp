/**
 * Simple ping endpoint
 *
 * URL: GET /ping
 * Returns: Pong response
 */

import type { EndpointRateLimitConfig, EndpointSchema } from 'nanowarp';

// Disable rate limiting for this public endpoint
export const rateLimit: EndpointRateLimitConfig = {
    enabled: false,
};

// OpenAPI schema definition
export const schema: EndpointSchema = {
    summary: 'Ping endpoint',
    description: 'Simple endpoint to test if the server is responding',
    tags: ['Utility'],
    responses: {
        '200': {
            description: 'Successful ping response',
            content: {
                'text/plain': {
                    schema: { type: 'string', example: 'pong' },
                    example: 'pong',
                },
            },
        },
    },
};

export const execute = async (path: string, request: Request, Database: any) => {
    return new Response('pong', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
    });
};
