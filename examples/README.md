# NanoWarp Examples

This directory contains a fully functional example server demonstrating NanoWarp's core features and best practices.

## 📂 Directory Structure

```
examples/
├── Database/              # Database directory (contains both data and endpoints)
│   ├── database.lock      # Auto-generated directory structure cache
│   ├── apikeys.json       # API key authentication configuration
│   └── Endpoints/         # API endpoint handlers
│       ├── DELETE/        # DELETE method endpoints
│       ├── GET/
│       │   ├── health.ts  # Health check endpoint (with rate limiting)
│       │   ├── ping.ts    # Simple ping endpoint (no rate limiting)
│       │   └── info.ts    # Server information endpoint
│       ├── PATCH/         # PATCH method endpoints
│       ├── POST/
│       │   └── echo.ts    # Echo endpoint (stricter rate limiting)
│       └── PUT/           # PUT method endpoints
├── server.ts              # Main server configuration
└── README.md              # This file
```

## 🚀 Quick Start

### Running the Example Server

From the project root:

**Using Bun (recommended):**
```bash
bun run example
# or
npm run example
```

**Using Node.js:**
```bash
npm run example:node
```

**Or directly from the examples folder:**
```bash
# With Bun
bun server.ts

# With Node.js (requires tsx)
npx tsx server.ts
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
- Disabled by default if not specified
- Different limits for different endpoint types
- Can be enabled/disabled per endpoint
- Examples:
  - `/ping`: Explicitly disabled (public)
  - `/health`: Generous limits (100 tokens, 50/sec refill)
  - `/info`: Moderate limits (50 tokens, 10/sec refill)
  - `/echo`: Stricter limits for POST (20 tokens, 5/sec refill)

### ✅ Database Structure
- Organized in `Database/` folder
- API keys configured in `Database/apikeys.json`
- Database lock file for directory structure caching
- Ready to add your own data files (JSON, etc.)

### ✅ File-Based Routing
- Endpoints organized by HTTP method
- Hot-reload support (changes apply immediately)
- TypeScript with full type safety

## 🔧 Customizing the Example

### Adding New Endpoints

1. Create a new file in `Database/Endpoints/[METHOD]/[name].ts`
2. Export the required `execute` function
3. Optionally export `rateLimit` and/or `schema` for additional features
4. The endpoint automatically becomes available

**Minimal Example:**
```typescript
// Database/Endpoints/GET/custom.ts
export const execute = async (path: string, request: Request, Database: any) => {
    return new Response(JSON.stringify({ message: 'Hello!' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
```

**Full Example (with rate limiting and OpenAPI schema):**
```typescript
// Database/Endpoints/GET/custom.ts
import type { EndpointRateLimitConfig, EndpointSchema } from 'nanowarp';

// Optional: Configure rate limiting (disabled by default)
export const rateLimit: EndpointRateLimitConfig = {
    enabled: true,
    maxTokens: 100,
    refillRate: 10,
    refillInterval: 1000,
};

// Optional: Define OpenAPI/Swagger schema (uses defaults if not provided)
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

// Required: Execute function
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

- **Rate Limiting**: See how different endpoints configure rate limits (optional, disabled by default)
- **OpenAPI Schemas**: Each endpoint shows proper schema definition (optional, uses defaults if not provided)
- **Error Handling**: The `/echo` endpoint demonstrates error handling
- **Database Usage**: The `database.lock` file stores directory structure cache
- **Minimal Endpoints**: The `/ping` endpoint shows the simplest possible implementation

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
3. **Optional Exports**: Only `execute` is required; `rateLimit` and `schema` are optional
4. **Rate Limiting**: Disabled by default; explicitly enable it per endpoint if needed
5. **OpenAPI Schema**: Auto-generated if not provided; customize for better documentation
6. **API Keys**: Configure in `Database/apikeys.json` with expiration dates
7. **Testing**: Use Swagger UI at `/docs` for interactive testing

Happy coding with NanoWarp! 🚀
