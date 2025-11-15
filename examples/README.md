# NanoWarp Examples

This directory contains a fully functional example server demonstrating NanoWarp's core features and best practices.

## 📂 Directory Structure

```
examples/
├── Database/              # Database directory (contains both data and endpoints)
│   ├── database.lock      # Sample database with users and products
│   ├── api-keys/          # API key storage
│   │   └── demo-key.json  # Example API key
│   └── Endpoints/         # API endpoint handlers
│       ├── GET/
│       │   ├── health.ts  # Health check endpoint (with rate limiting)
│       │   ├── ping.ts    # Simple ping endpoint (no rate limiting)
│       │   └── info.ts    # Server information endpoint
│       └── POST/
│           └── echo.ts    # Echo endpoint (stricter rate limiting)
├── server.ts              # Main server configuration
└── README.md              # This file
```

## 🚀 Quick Start

### Running the Example Server

From the project root, run:

```bash
npm run example
```

Or using Bun:

```bash
bun run example
```

Or directly from the examples folder:

```bash
bun server.ts
```

The server will start on **http://localhost:3000** with Swagger documentation enabled.

## 📖 Available Endpoints

### Utility Endpoints

All example endpoints are utility-focused, demonstrating common patterns:

#### `GET /health`
- **Purpose**: Health check endpoint
- **Rate Limit**: 100 tokens max, refills 50/second
- **Returns**: Server health status with uptime and timestamp
- **Example Response**:
  ```json
  {
    "status": "healthy",
    "uptime": 12345.67,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
  ```

#### `GET /ping`
- **Purpose**: Simple connectivity test
- **Rate Limit**: Disabled (public endpoint)
- **Returns**: Plain text "pong"
- **Example Response**: `pong`

#### `GET /info`
- **Purpose**: Detailed server information
- **Rate Limit**: 50 tokens max, refills 10/second
- **Returns**: Runtime, version, memory usage, platform info
- **Example Response**:
  ```json
  {
    "version": "1.0.0",
    "runtime": "Bun",
    "uptime": 12345.67,
    "timestamp": "2024-01-15T10:30:00.000Z",
    "memory": { "rss": 123456, "heapTotal": 78900, ... },
    "platform": "linux"
  }
  ```

#### `POST /echo`
- **Purpose**: Echo back request body with metadata
- **Rate Limit**: 20 tokens max, refills 5/second (stricter for POST)
- **Request Body**: Any JSON object
- **Returns**: Echoed data with metadata
- **Example Request**:
  ```bash
  curl -X POST http://localhost:3000/echo \
    -H "Content-Type: application/json" \
    -d '{"message": "Hello, NanoWarp!"}'
  ```
- **Example Response**:
  ```json
  {
    "echo": { "message": "Hello, NanoWarp!" },
    "receivedAt": "2024-01-15T10:30:00.000Z",
    "contentType": "application/json",
    "bodySize": 32
  }
  ```

## 📚 Swagger Documentation

Swagger UI is **enabled** in this example. Once the server is running, visit:

- **Swagger UI**: http://localhost:3000/docs
- **OpenAPI Spec**: http://localhost:3000/openapi.json

The Swagger interface provides:
- Interactive API testing
- Complete endpoint documentation
- Request/response schemas
- Example payloads

## ⚙️ Configuration Features

This example demonstrates:

### ✅ Swagger/OpenAPI
- Enabled with custom metadata
- Complete request/response schemas
- Tagged endpoints for organization

### ✅ Rate Limiting
- Per-endpoint configuration
- Different limits for different endpoint types
- Can be enabled/disabled per endpoint
- Examples:
  - `/ping`: No rate limiting (public)
  - `/health`: Generous limits (100 tokens)
  - `/info`: Moderate limits (50 tokens)
  - `/echo`: Stricter limits for POST (20 tokens)

### ✅ Database Structure
- Organized in `Database/` folder
- Includes sample data (users, products)
- API keys stored in `Database/api-keys/`
- Database lock file for data persistence

### ✅ File-Based Routing
- Endpoints organized by HTTP method
- Hot-reload support (changes apply immediately)
- TypeScript with full type safety

## 🔧 Customizing the Example

### Adding New Endpoints

1. Create a new file in `Database/Endpoints/[METHOD]/[name].ts`
2. Export `execute`, `schema`, and optionally `rateLimit`
3. The endpoint automatically becomes available

Example:
```typescript
// Database/Endpoints/GET/custom.ts
import type { EndpointRateLimitConfig, EndpointSchema } from 'nanowarp';

export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 100,
    refillRate: 10,
    refillInterval: 1000,
};

export const schema: EndpointSchema = {
    summary: 'Custom endpoint',
    description: 'Your custom endpoint',
    tags: ['Custom'],
    responses: {
        '200': {
            description: 'Success',
            content: {
                'application/json': {
                    schema: { type: 'object' },
                },
            },
        },
    },
};

export const execute = async (path: string, request: Request, Database: any) => {
    return new Response(JSON.stringify({ message: 'Hello!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
```

### Modifying Server Configuration

Edit `server.ts` to customize:
- Port number
- Database path
- Rate limiting defaults
- OpenAPI metadata
- Cache and timeout settings

## 📝 Learning Resources

- **Rate Limiting**: See how different endpoints use different rate limits
- **OpenAPI Schemas**: Each endpoint shows proper schema definition
- **Error Handling**: The `/echo` endpoint demonstrates error handling
- **Database Usage**: Check the `database.lock` file for data structure examples

## 🎯 Use Cases

This example is perfect for:
- Learning NanoWarp basics
- Testing NanoWarp features
- Starting a new project
- Understanding best practices
- API prototyping

## 💡 Tips

1. **Hot Reload**: Changes to endpoint files apply immediately—no restart needed
2. **TypeScript**: Use the exported types for better IDE support
3. **Database**: The database.lock file demonstrates the expected JSON structure
4. **API Keys**: Add more keys in `Database/api-keys/` following the demo format
5. **Testing**: Use Swagger UI at `/docs` for interactive testing

Happy coding with NanoWarp! 🚀
