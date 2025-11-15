/**
 * Echo POST endpoint - returns what you send
 *
 * URL: POST /echo
 * Body: Any JSON
 * Returns: The same JSON back with metadata
 */

export const execute = async (path: string, request: Request, Database: any) => {
    try {
        const body = await request.json();

        const response = {
            message: 'Echo successful',
            receivedData: body,
            timestamp: new Date().toISOString(),
            path,
            method: request.method,
        };

        return new Response(JSON.stringify(response, null, 2), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'Invalid JSON',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, null, 2), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
