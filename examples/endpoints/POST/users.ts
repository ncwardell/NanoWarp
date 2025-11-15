/**
 * Create user endpoint with database integration
 *
 * URL: POST /users
 * Body: { "name": "John Doe", "email": "john@example.com" }
 * Returns: Created user with ID
 *
 * This demonstrates writing data to the NanoWarp database.
 * Data is stored in ./test-data/users.json
 */

import type { EndpointRateLimitConfig, EndpointSchema } from 'nanowarp';
import { DataManager } from 'nanowarp';

// Stricter rate limiting for user creation
export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 10,
    refillRate: 2,
    refillInterval: 60000, // 1 minute
};

// OpenAPI schema for this endpoint
export const schema: EndpointSchema = {
    summary: 'Create a new user',
    description: 'Creates a new user and stores it in the database',
    tags: ['users'],
    requestBody: {
        description: 'User data',
        required: true,
        content: {
            'application/json': {
                schema: DataManager.createSchema('object', {
                    properties: {
                        name: { type: 'string', description: 'User name' },
                        email: { type: 'string', description: 'User email address', format: 'email' },
                    },
                    required: ['name', 'email'],
                }),
                example: {
                    name: 'John Doe',
                    email: 'john@example.com',
                },
            },
        },
    },
    responses: {
        '201': {
            description: 'User created successfully',
            content: {
                'application/json': {
                    schema: DataManager.createSchema('object', {
                        properties: {
                            message: { type: 'string' },
                            user: DataManager.createSchema('object', {
                                properties: {
                                    id: { type: 'number', description: 'User ID' },
                                    name: { type: 'string', description: 'User name' },
                                    email: { type: 'string', description: 'User email' },
                                    createdAt: { type: 'string', format: 'date-time' },
                                },
                            }),
                        },
                    }),
                },
            },
        },
        '400': {
            description: 'Missing required fields',
            content: {
                'application/json': {
                    schema: DataManager.createSchema('object', {
                        properties: {
                            error: { type: 'string' },
                            required: DataManager.createSchema('array', {
                                items: { type: 'string' },
                            }),
                        },
                    }),
                },
            },
        },
        '500': {
            description: 'Failed to create user',
            content: {
                'application/json': {
                    schema: DataManager.createSchema('object', {
                        properties: {
                            error: { type: 'string' },
                            message: { type: 'string' },
                        },
                    }),
                },
            },
        },
    },
};

export const execute = async (path: string, request: Request, Database: any) => {
    try {
        // Parse request body
        const body = await request.json();

        if (!body.name || !body.email) {
            return new Response(JSON.stringify({
                error: 'Missing required fields',
                required: ['name', 'email']
            }, null, 2), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Retrieve existing users or create empty array
        let users = [];
        try {
            users = await Database.retrieveData('./test-data/users.json') || [];
        } catch (error) {
            // File doesn't exist yet, start with empty array
            users = [];
        }

        // Create new user with ID
        const newUser = {
            id: Date.now(),
            name: body.name,
            email: body.email,
            createdAt: new Date().toISOString()
        };

        users.push(newUser);

        // Save back to database
        await Database.saveData('./test-data/users.json', JSON.stringify(users, null, 2));

        return new Response(JSON.stringify({
            message: 'User created successfully',
            user: newUser
        }, null, 2), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'Failed to create user',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, null, 2), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
