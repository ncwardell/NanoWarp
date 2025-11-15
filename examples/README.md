# NanoWarp Examples

This directory contains example usage of NanoWarp.

## Running the Demo

```bash
bun demo.ts
```

Or using the npm script:

```bash
npm run dev
```

This will start a NanoWarp server on port 3000 with the default data directory (`./data`).

## Test Server with Example Endpoints

Run the test server to experiment with pre-built endpoints:

```bash
bun test-server.ts
```

This starts a server on port 3001 with a `./test-data` directory.

### Using the Example Endpoints

Copy the example endpoints to your test data directory:

```bash
# Copy all GET endpoints
cp -r examples/endpoints/GET test-data/Endpoints/

# Copy all POST endpoints
cp -r examples/endpoints/POST test-data/Endpoints/
```

Or copy individual endpoints:

```bash
mkdir -p test-data/Endpoints/GET test-data/Endpoints/POST
cp examples/endpoints/GET/hello.ts test-data/Endpoints/GET/
cp examples/endpoints/POST/echo.ts test-data/Endpoints/POST/
```

### Available Test Endpoints

**GET Endpoints:**
- `/hello` - Simple greeting message
- `/echo?message=test` - Echo query parameters back
- `/users` - List all users from database
- `/status` - Server health check and system info

**POST Endpoints:**
- `/users` - Create a new user (requires JSON body with `name` and `email`)
- `/echo` - Echo JSON body back with metadata

### Testing the Endpoints

```bash
# Simple GET request
curl http://localhost:3001/hello

# GET with query parameters
curl http://localhost:3001/echo?message=hello&name=world

# POST request to create a user
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'

# GET users list
curl http://localhost:3001/users

# Check server status
curl http://localhost:3001/status
```

### Hot Reload Testing

Edit any endpoint file while the server is running and see your changes instantly:

1. Start the test server: `bun test-server.ts`
2. Copy an endpoint: `cp examples/endpoints/GET/hello.ts test-data/Endpoints/GET/`
3. Test it: `curl http://localhost:3001/hello`
4. Edit `test-data/Endpoints/GET/hello.ts` and change the message
5. Test again - see the changes immediately!

## Creating Your Own Server

```typescript
import { NanoWarp } from "nanowarp";

const server = new NanoWarp(8080, './my-data');
await server.start();
```

See the main [README](../README.md) for full documentation.
