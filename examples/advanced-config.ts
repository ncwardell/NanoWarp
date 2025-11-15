/**
 * Advanced NanoWarp configuration example
 *
 * This example demonstrates all available configuration options including:
 * - Custom port and data path
 * - Per-endpoint rate limiting
 * - Configurable cache TTL
 * - Custom request timeouts
 * - OpenAPI/Swagger documentation
 */

import { NanoWarp } from '../dist/index.js';

const server = new NanoWarp({
    // Server configuration
    port: 8080,
    dataPath: './examples/data',

    // Rate limiting configuration
    rateLimit: {
        enabled: true,
        maxTokens: 200,          // 200 requests per IP
        refillRate: 20,          // Add 20 tokens per second
        refillInterval: 1000,    // Refill every second

        // Per-endpoint rate limits (stricter for auth endpoints)
        perEndpoint: {
            '/auth/login': {
                maxTokens: 5,    // Only 5 login attempts
                refillRate: 1,   // Add 1 token per minute
                refillInterval: 60000
            },
            '/users': {
                maxTokens: 50,   // 50 requests for user endpoints
                refillRate: 10,
                refillInterval: 1000
            }
        }
    },

    // Cache configuration
    cache: {
        apiKeyTTL: 120000,       // Cache API keys for 2 minutes
        moduleCacheSize: 200     // Keep 200 endpoints in memory
    },

    // Timeout configuration
    timeout: {
        request: 60000,          // 60 second request timeout
        shutdown: 45000          // 45 second graceful shutdown timeout
    },

    // OpenAPI/Swagger documentation
    openapi: {
        enabled: true,
        specPath: '/openapi.json',
        uiPath: '/docs',
        info: {
            title: 'My Awesome API',
            version: '2.0.0',
            description: 'A powerful API built with NanoWarp featuring advanced configuration',
            contact: {
                name: 'API Support',
                email: 'support@example.com',
                url: 'https://example.com/support'
            },
            license: {
                name: 'MIT',
                url: 'https://opensource.org/licenses/MIT'
            }
        },
        servers: [
            {
                url: 'http://localhost:8080',
                description: 'Development server'
            },
            {
                url: 'https://api.example.com',
                description: 'Production server'
            }
        ]
    },

    // Enable request logging
    logging: true
});

// Start the server
await server.start();

console.log('\n🚀 Advanced NanoWarp server running!');
console.log('📚 API Documentation: http://localhost:8080/docs');
console.log('📄 OpenAPI Spec: http://localhost:8080/openapi.json');
console.log('\nEndpoints:');
console.log('  GET    /hello');
console.log('  GET    /users');
console.log('  POST   /users');
console.log('  PUT    /users');
console.log('  PATCH  /users');
console.log('  DELETE /users?id=1');
console.log('\nRate Limits:');
console.log('  /auth/login: 5 requests, refills 1/min');
console.log('  /users: 50 requests, refills 10/sec');
console.log('  Default: 200 requests, refills 20/sec\n');
