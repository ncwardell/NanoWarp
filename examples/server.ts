/**
 * NanoWarp Example Server
 *
 * This is a complete example demonstrating all key features of NanoWarp:
 * - File-based routing with hot-reload
 * - Swagger/OpenAPI documentation
 * - Per-endpoint rate limiting
 * - Database structure
 * - API key management
 *
 * Run this file to start the example server:
 *   bun server.ts
 *   or
 *   npm run example
 */

import { NanoWarp } from '../src/index';

const server = new NanoWarp({
    // Server configuration
    port: 3000,
    dataPath: './examples/Database',

    // Cache configuration
    cache: {
        apiKeyTTL: 60000,        // Cache API keys for 60 seconds
        moduleCacheSize: 100,    // Keep 100 endpoints in memory
    },

    // Timeout configuration
    timeout: {
        request: 30000,          // 30 second request timeout
        shutdown: 30000,         // 30 second graceful shutdown timeout
    },

    // OpenAPI/Swagger documentation (ENABLED)
    openapi: {
        enabled: true,           // ✅ Swagger enabled
        specPath: '/openapi.json',
        uiPath: '/docs',
        info: {
            title: 'NanoWarp Example API',
            version: '1.0.0',
            description: 'Example API demonstrating NanoWarp features including Swagger documentation, rate limiting, and file-based routing',
            contact: {
                name: 'NanoWarp',
                url: 'https://github.com/ncwardell/NanoWarp',
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT',
            },
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development server',
            },
        ],
    },

    // Enable request logging
    logging: true,
});

// Start the server
await server.start();

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║         🚀 NanoWarp Example Server Running!                   ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');
console.log('📚 Swagger UI:      http://localhost:3000/docs');
console.log('📄 OpenAPI Spec:    http://localhost:3000/openapi.json\n');
console.log('Available Endpoints:');
console.log('  GET    /health    - Health check (rate limited)');
console.log('  GET    /ping      - Simple ping (no rate limit)');
console.log('  GET    /info      - Server information (rate limited)');
console.log('  POST   /echo      - Echo request body (stricter rate limit)\n');
console.log('💡 Tip: Visit http://localhost:3000/docs to explore the API interactively!\n');
console.log('Press Ctrl+C to stop the server.\n');
