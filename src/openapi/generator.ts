/**
 * OpenAPI/Swagger specification generator
 *
 * Automatically generates OpenAPI 3.0 documentation by scanning the Endpoints directory
 */

import { readdir } from "node:fs/promises";
import path from "path";
import type { NanoWarpConfig } from "../types/config";

export interface OpenAPISpec {
    openapi: string;
    info: {
        title: string;
        version: string;
        description?: string;
        contact?: {
            name?: string;
            email?: string;
            url?: string;
        };
        license?: {
            name?: string;
            url?: string;
        };
    };
    servers?: Array<{
        url: string;
        description?: string;
    }>;
    paths: Record<string, any>;
    components: {
        securitySchemes?: Record<string, any>;
    };
}

/**
 * Scan a directory recursively for TypeScript endpoint files
 */
async function scanEndpointDirectory(
    basePath: string,
    method: string,
    currentPath: string = ''
): Promise<Array<{ path: string; fullPath: string }>> {
    const results: Array<{ path: string; fullPath: string }> = [];
    const methodPath = path.join(basePath, 'Endpoints', method);
    const scanPath = currentPath ? path.join(methodPath, currentPath) : methodPath;

    try {
        const entries = await readdir(scanPath, { withFileTypes: true });

        for (const entry of entries) {
            const relativePath = currentPath ? path.join(currentPath, entry.name) : entry.name;

            if (entry.isDirectory()) {
                // Recursively scan subdirectories
                const subResults = await scanEndpointDirectory(basePath, method, relativePath);
                results.push(...subResults);
            } else if (entry.isFile() && entry.name.endsWith('.ts')) {
                // Found an endpoint file
                const endpointPath = relativePath.replace(/\.ts$/, '');
                const apiPath = '/' + endpointPath.replace(/\\/g, '/');
                results.push({
                    path: apiPath,
                    fullPath: path.join(scanPath, entry.name)
                });
            }
        }
    } catch (error) {
        // Directory doesn't exist or can't be read
    }

    return results;
}

/**
 * Generate a default OpenAPI response schema for an endpoint
 */
function generateDefaultResponses(method: string): Record<string, any> {
    const commonResponses = {
        '401': {
            description: 'Unauthorized - Invalid or missing API key',
            content: {
                'text/plain': {
                    schema: { type: 'string' }
                }
            }
        },
        '429': {
            description: 'Too Many Requests - Rate limit exceeded',
            content: {
                'text/plain': {
                    schema: { type: 'string' }
                }
            }
        },
        '500': {
            description: 'Internal Server Error',
            content: {
                'text/plain': {
                    schema: { type: 'string' }
                }
            }
        },
        '504': {
            description: 'Gateway Timeout - Request timeout',
            content: {
                'text/plain': {
                    schema: { type: 'string' }
                }
            }
        }
    };

    switch (method.toUpperCase()) {
        case 'GET':
            return {
                '200': {
                    description: 'Successful response',
                    content: {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    }
                },
                '404': {
                    description: 'Resource not found',
                    content: {
                        'text/plain': {
                            schema: { type: 'string' }
                        }
                    }
                },
                ...commonResponses
            };
        case 'POST':
            return {
                '201': {
                    description: 'Resource created successfully',
                    content: {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    }
                },
                '200': {
                    description: 'Successful response',
                    content: {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    }
                },
                '400': {
                    description: 'Bad Request - Invalid input',
                    content: {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    }
                },
                ...commonResponses
            };
        case 'PUT':
        case 'PATCH':
            return {
                '200': {
                    description: 'Resource updated successfully',
                    content: {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    }
                },
                '404': {
                    description: 'Resource not found',
                    content: {
                        'text/plain': {
                            schema: { type: 'string' }
                        }
                    }
                },
                '400': {
                    description: 'Bad Request - Invalid input',
                    content: {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    }
                },
                ...commonResponses
            };
        case 'DELETE':
            return {
                '204': {
                    description: 'Resource deleted successfully'
                },
                '200': {
                    description: 'Resource deleted successfully',
                    content: {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    }
                },
                '404': {
                    description: 'Resource not found',
                    content: {
                        'text/plain': {
                            schema: { type: 'string' }
                        }
                    }
                },
                ...commonResponses
            };
        default:
            return {
                '200': {
                    description: 'Successful response',
                    content: {
                        'application/json': {
                            schema: { type: 'object' }
                        }
                    }
                },
                ...commonResponses
            };
    }
}

/**
 * Generate request body schema for POST/PUT/PATCH methods
 */
function generateRequestBody(method: string): any {
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        return {
            description: 'Request body',
            required: false,
            content: {
                'application/json': {
                    schema: {
                        type: 'object'
                    }
                }
            }
        };
    }
    return undefined;
}

/**
 * Generate OpenAPI specification from scanned endpoints
 */
export async function generateOpenAPISpec(
    dataPath: string,
    config: Required<NanoWarpConfig>,
    serverUrl?: string
): Promise<OpenAPISpec> {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    const paths: Record<string, any> = {};

    // Scan all HTTP method directories
    for (const method of methods) {
        const endpoints = await scanEndpointDirectory(dataPath, method);

        for (const endpoint of endpoints) {
            const apiPath = endpoint.path;

            // Initialize path object if it doesn't exist
            if (!paths[apiPath]) {
                paths[apiPath] = {};
            }

            // Add operation for this method
            paths[apiPath][method.toLowerCase()] = {
                summary: `${method} ${apiPath}`,
                description: `Endpoint handler for ${method} ${apiPath}`,
                tags: [apiPath.split('/')[1] || 'default'],
                parameters: [],
                responses: generateDefaultResponses(method)
            };

            // Add request body for POST/PUT/PATCH
            const requestBody = generateRequestBody(method);
            if (requestBody) {
                paths[apiPath][method.toLowerCase()].requestBody = requestBody;
            }

            // Add security requirement if API keys are configured
            paths[apiPath][method.toLowerCase()].security = [
                { apiKey: [] }
            ];
        }
    }

    // Build the OpenAPI spec
    const spec: OpenAPISpec = {
        openapi: '3.0.0',
        info: {
            title: config.openapi.info!.title! || 'NanoWarp API',
            version: config.openapi.info!.version! || '1.0.0',
            description: config.openapi.info!.description || 'API built with NanoWarp',
            contact: config.openapi.info!.contact,
            license: config.openapi.info!.license
        },
        servers: config.openapi.servers && config.openapi.servers.length > 0
            ? config.openapi.servers
            : serverUrl
                ? [{ url: serverUrl, description: 'API Server' }]
                : [{ url: 'http://localhost:' + config.port, description: 'Local Server' }],
        paths,
        components: {
            securitySchemes: {
                apiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-API-Key',
                    description: 'API key authentication'
                }
            }
        }
    };

    return spec;
}

/**
 * Generate Swagger UI HTML page
 */
export function generateSwaggerUI(specUrl: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NanoWarp API Documentation</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
        body { margin: 0; padding: 0; }
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
        window.onload = function() {
            window.ui = SwaggerUIBundle({
                url: '${specUrl}',
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "StandaloneLayout"
            });
        };
    </script>
</body>
</html>`;
}
