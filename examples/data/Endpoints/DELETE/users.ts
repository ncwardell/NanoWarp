/**
 * DELETE endpoint example - Delete user
 *
 * URL: DELETE /users?id=1
 */

export const execute = async (path: string, request: Request, Database: any) => {
    try {
        const url = new URL(request.url);
        const userId = url.searchParams.get('id');

        if (!userId) {
            return new Response(JSON.stringify({ error: 'User ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Simulate deleting a user
        return new Response(JSON.stringify({
            message: `User ${userId} deleted successfully`,
            deletedAt: new Date().toISOString()
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to delete user' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
