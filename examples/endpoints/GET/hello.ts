/**
 * Simple GET endpoint example
 *
 * URL: GET /hello
 * Returns: Plain text greeting
 */

export const execute = async (path: string, request: Request, Database: any) => {
    return new Response('Hello from NanoWarp! 👋', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
    });
};
