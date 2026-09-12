/**
 * List todos
 *
 * URL: GET /todos
 * Returns: Array of todo items, or [] when the store is empty.
 */

import type { EndpointSchema } from '../../../../src'; // Should be 'nanowarp'

export const schema: EndpointSchema = {
    summary: 'List todos',
    description: 'Returns all todos persisted in todos.json',
    tags: ['Todos'],
    responses: {
        '200': {
            description: 'List of todos',
            content: {
                'application/json': {
                    schema: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                id: { type: 'integer' },
                                title: { type: 'string' },
                                completed: { type: 'boolean' },
                            },
                        },
                    },
                },
            },
        },
    },
};

export const execute = async (_path: string, _request: Request, Database: any) => {
    const filePath = `${Database.DataTree.RootDirectory}/todos.json`;
    const data = await Database.retrieveData(filePath);
    const todos = Array.isArray(data) ? data : [];

    return new Response(JSON.stringify(todos), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
