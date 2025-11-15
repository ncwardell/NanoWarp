/**
 * PUT endpoint example - Update user
 *
 * URL: PUT /users
 * Body: { "id": 1, "name": "Updated Name", "email": "updated@example.com" }
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

        // Simulate updating a user
        const updatedUser = {
            id: body.id,
            name: body.name,
            email: body.email,
            updatedAt: new Date().toISOString()
        };

        return new Response(JSON.stringify(updatedUser), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to update user' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
