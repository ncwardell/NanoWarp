/**
 * Users list endpoint with database integration
 *
 * URL: GET /users
 * Returns: List of users from database
 *
 * This demonstrates reading data from the NanoWarp database.
 * Data is stored in ./test-data/users.json
 */

import type { EndpointRateLimitConfig, EndpointSchema } from 'nanowarp';
import { DataManager } from 'nanowarp';

// Rate limiting configuration for this endpoint
export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 100,
    refillRate: 10,
    refillInterval: 1000, // 1 second
};

// OpenAPI schema for this endpoint
export const schema: EndpointSchema = {
    summary: 'Get all users',
    description: 'Retrieves a list of all users from the database',
    tags: ['users'],
    responses: {
        '200': {
            description: 'List of users retrieved successfully',
            content: {
                'application/json': {
                    schema: DataManager.createSchema('object', {
                        properties: {
                            count: { type: 'number', description: 'Number of users' },
                            users: DataManager.createSchema('array', {
                                items: DataManager.createSchema('object', {
                                    properties: {
                                        id: { type: 'string', description: 'User ID' },
                                        name: { type: 'string', description: 'User name' },
                                        email: { type: 'string', description: 'User email' },
                                    },
                                }),
                            }),
                        },
                    }),
                    example: {
                        count: 2,
                        users: [
                            { id: '1', name: 'John Doe', email: 'john@example.com' },
                            { id: '2', name: 'Jane Smith', email: 'jane@example.com' },
                        ],
                    },
                },
            },
        },
        '500': {
            description: 'Failed to retrieve users',
            content: {
                'application/json': {
                    schema: DataManager.createSchema('object', {
                        properties: {
                            error: { type: 'string' },
                            message: { type: 'string' },
                            hint: { type: 'string' },
                        },
                    }),
                },
            },
        },
    },
};

export const execute = async (path: string, request: Request, Database: any) => {
    try {
        // Try to retrieve users from database
        const users = await Database.retrieveData('./test-data/users.json');

        if (!users || (Array.isArray(users) && users.length === 0)) {
            return new Response(JSON.stringify({
                message: 'No users found. Create some with POST /users',
                users: []
            }, null, 2), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            count: users.length,
            users
        }, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'Failed to retrieve users',
            message: error instanceof Error ? error.message : 'Unknown error',
            hint: 'Create users with POST /users first'
        }, null, 2), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
