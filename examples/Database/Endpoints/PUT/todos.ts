/**
 * Replace a todo (full update)
 *
 * URL: PUT /todos
 * Body: { "id": 1234, "title": "...", "completed": false }
 * Returns: The fully replaced todo, or 404 if id is unknown.
 *
 * Semantics: PUT replaces the entire resource — any existing fields not
 * provided in the body will be lost.
 */

import type { EndpointRateLimitConfig, EndpointSchema } from '../../../../src';

export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 30,
    refillRate: 5,
    refillInterval: 1000,
};

export const schema: EndpointSchema = {
    summary: 'Replace a todo',
    description: 'Replaces an existing todo identified by id. Fields not in the request body are dropped.',
    tags: ['Todos'],
    requestBody: {
        description: 'Full todo payload',
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    required: ['id', 'title'],
                    properties: {
                        id: { type: 'integer' },
                        title: { type: 'string' },
                        completed: { type: 'boolean' },
                    },
                },
            },
        },
    },
    responses: {
        '200': { description: 'Replaced' },
        '400': { description: 'Missing required fields' },
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

    if (typeof body?.id !== 'number' || typeof body?.title !== 'string') {
        return new Response(JSON.stringify({ error: 'id (number) and title (string) are required' }), {
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

    const replaced = {
        id: body.id,
        title: body.title,
        completed: body.completed ?? false,
    };
    todos[idx] = replaced;
    await Database.saveData(filePath, JSON.stringify(todos, null, 2));

    return new Response(JSON.stringify(replaced), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
