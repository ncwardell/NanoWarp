/**
 * Echo endpoint with query parameters
 *
 * URL: GET /echo?message=test&name=john
 * Returns: JSON with query parameters and request info
 */

export const execute = async (path: string, request: Request, Database: any) => {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams.entries());

    const response = {
        path,
        method: request.method,
        queryParams: params,
        timestamp: new Date().toISOString(),
        message: params.message || 'No message provided',
    };

    return new Response(JSON.stringify(response, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
