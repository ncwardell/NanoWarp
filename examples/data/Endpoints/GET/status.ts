/**
 * Status/health check endpoint
 *
 * URL: GET /status
 * Returns: Server status and system info
 */

export const execute = async (path: string, request: Request, Database: any) => {
    const status = {
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        runtime: typeof Bun !== 'undefined' ? 'Bun' : 'Node.js',
        memory: process.memoryUsage(),
    };

    return new Response(JSON.stringify(status, null, 2), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
