/**
 * Delete a todo
 *
 * URL: DELETE /todos
 * Body: { "id": 1234 }
 * Returns: The removed todo, or 404 if id is unknown.
 */

import type { EndpointRateLimitConfig, EndpointSchema } from '../../../../src';

export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 30,
    refillRate: 5,
    refillInterval: 1000,
};

export const schema: EndpointSchema = {
    summary: 'Delete a todo',
    description: 'Removes a todo identified by id.',
    tags: ['Todos'],
    requestBody: {
        description: 'Identifier of the todo to delete',
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    required: ['id'],
                    properties: {
                        id: { type: 'integer' },
                    },
                },
            },
        },
    },
    responses: {
        '200': { description: 'Deleted' },
        '400': { description: 'Missing id' },
        '404': { description: 'Todo not found' },
    },
};

export const execute = async (_path: string, request: Request, Database: any) => {
    let body: any;
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (typeof body?.id !== 'number') {
        return new Response(JSON.stringify({ error: 'id (number) is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const filePath = `${Database.DataTree.RootDirectory}/todos.json`;
    const existing = await Database.retrieveData(filePath);
    const todos = Array.isArray(existing) ? existing : [];

    const idx = todos.findIndex((t: any) => t.id === body.id);
    if (idx === -1) {
        return new Response(JSON.stringify({ error: 'Todo not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const [removed] = todos.splice(idx, 1);
    await Database.saveData(filePath, JSON.stringify(todos, null, 2));

    return new Response(JSON.stringify(removed), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
