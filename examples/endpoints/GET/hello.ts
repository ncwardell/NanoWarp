/**
 * Simple GET endpoint example
 *
 * URL: GET /hello
 * Returns: Plain text greeting
 */

import type { EndpointRateLimitConfig, EndpointSchema } from '../../../src/types/config';

// Disable rate limiting for this public endpoint
export const rateLimit: EndpointRateLimitConfig = {
    enabled: false,
};

// Simple OpenAPI schema
export const schema: EndpointSchema = {
    summary: 'Hello world',
    description: 'A simple greeting endpoint',
    tags: ['examples'],
    responses: {
        '200': {
            description: 'Greeting message',
            content: {
                'text/plain': {
                    schema: { type: 'string' },
                    example: 'Hello from NanoWarp! 👋',
                },
            },
        },
    },
};

export const execute = async (path: string, request: Request, Database: any) => {
    return new Response('Hello from NanoWarp! 👋', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
    });
};
