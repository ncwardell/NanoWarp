/**
 * Echo endpoint
 *
 * URL: POST /echo
 * Returns: Echoes back the request body with additional metadata
 */

import type { EndpointRateLimitConfig, EndpointSchema } from 'nanowarp';

// Configure stricter rate limiting for POST endpoints
export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 20,
    refillRate: 5,
    refillInterval: 1000,
};

// OpenAPI schema definition
export const schema: EndpointSchema = {
    summary: 'Echo request',
    description: 'Echoes back the request body along with request metadata',
    tags: ['Utility'],
    requestBody: {
        description: 'Any JSON data to echo back',
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    example: { message: 'Hello, NanoWarp!' },
                },
                example: { message: 'Hello, NanoWarp!' },
            },
        },
    },
    responses: {
        '200': {
            description: 'Request echoed successfully',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            echo: { type: 'object', description: 'The echoed request body' },
                            receivedAt: { type: 'string', example: '2024-01-15T10:30:00.000Z' },
                            contentType: { type: 'string', example: 'application/json' },
                            bodySize: { type: 'number', example: 123 },
                        },
                    },
                },
            },
        },
        '400': {
            description: 'Invalid request body',
            content: {
                'application/json': {
                    schema: {
                        type: 'object',
                        properties: {
                            error: { type: 'string', example: 'Invalid JSON' },
                        },
                    },
                },
            },
        },
    },
};

export const execute = async (path: string, request: Request, Database: any) => {
    try {
        const body = await request.text();
        let parsedBody;

        try {
            parsedBody = JSON.parse(body);
        } catch (e) {
            return new Response(
                JSON.stringify({ error: 'Invalid JSON in request body' }),
                {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        const response = {
            echo: parsedBody,
            receivedAt: new Date().toISOString(),
            contentType: request.headers.get('content-type') || 'unknown',
            bodySize: body.length,
        };

        return new Response(JSON.stringify(response, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(
            JSON.stringify({ error: 'Failed to process request' }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
};
