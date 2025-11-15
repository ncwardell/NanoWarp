/**
 * PATCH endpoint example - Partially update user
 *
 * URL: PATCH /users
 * Body: { "id": 1, "name": "New Name" } (only fields to update)
 */

export const execute = async (path: string, request: Request, Database: any) => {
    try {
        const body = await request.json();

        // Validate input
        if (!body.id) {
            return new Response(JSON.stringify({ error: 'User ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Simulate partially updating a user
        const patchedUser = {
            id: body.id,
            ...body,
            updatedAt: new Date().toISOString()
        };

        return new Response(JSON.stringify(patchedUser), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to patch user' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
