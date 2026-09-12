/**
 * Partially update a todo
 *
 * URL: PATCH /todos
 * Body: { "id": 1234, ...fields to update }
 * Returns: The updated todo, or 404 if id is unknown.
 *
 * Semantics: PATCH merges the provided fields into the existing todo.
 * Fields not in the request body are preserved.
 */

import type { EndpointRateLimitConfig, EndpointSchema } from '../../../../src';

export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 30,
    refillRate: 5,
    refillInterval: 1000,
};

export const schema: EndpointSchema = {
    summary: 'Partially update a todo',
    description: 'Merges the supplied fields into an existing todo.',
    tags: ['Todos'],
    requestBody: {
        description: 'Partial todo payload',
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    required: ['id'],
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
        '200': { description: 'Updated' },
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

    // Merge: keep existing fields, overlay incoming fields, but never let id change.
    const merged = { ...todos[idx], ...body, id: todos[idx].id };
    todos[idx] = merged;
    await Database.saveData(filePath, JSON.stringify(todos, null, 2));

    return new Response(JSON.stringify(merged), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
