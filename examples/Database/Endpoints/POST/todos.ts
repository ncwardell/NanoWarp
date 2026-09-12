/**
 * Create a todo
 *
 * URL: POST /todos
 * Body: { "title": "..." }
 * Returns: The newly created todo (status 201).
 */

import type { EndpointRateLimitConfig, EndpointSchema } from '../../../../src'; // Should be 'nanowarp'

export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 30,
    refillRate: 5,
    refillInterval: 1000,
};

export const schema: EndpointSchema = {
    summary: 'Create a todo',
    description: 'Appends a new todo to todos.json',
    tags: ['Todos'],
    requestBody: {
        description: 'Todo payload',
        required: true,
        content: {
            'application/json': {
                schema: {
                    type: 'object',
                    required: ['title'],
                    properties: {
                        title: { type: 'string', example: 'Buy milk' },
                    },
                },
            },
        },
    },
    responses: {
        '201': { description: 'Todo created' },
        '400': { description: 'Missing title' },
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

    if (!body?.title || typeof body.title !== 'string') {
        return new Response(JSON.stringify({ error: 'title is required and must be a string' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const filePath = `${Database.DataTree.RootDirectory}/todos.json`;
    const existing = await Database.retrieveData(filePath);
    const todos = Array.isArray(existing) ? existing : [];

    const newTodo = {
        id: Date.now(),
        title: body.title,
        completed: false,
        createdAt: new Date().toISOString(),
    };

    todos.push(newTodo);
    await Database.saveData(filePath, JSON.stringify(todos, null, 2));

    return new Response(JSON.stringify(newTodo), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
    });
};
