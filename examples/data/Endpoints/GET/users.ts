/**
 * Users list endpoint with database integration
 *
 * URL: GET /users
 * Returns: List of users from database
 *
 * This demonstrates reading data from the NanoWarp database.
 * Data is stored in ./test-data/users.json
 */

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
