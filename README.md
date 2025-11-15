# NanoWarp

A lightning-fast API framework built on Bun with hot-swappable file-based endpoints.

## Why NanoWarp?

- **Hot-Swappable Endpoints**: Add or modify API endpoints without restarting the server - just save a `.ts` file
- **File-Based Everything**: Endpoints, data, and configuration are all stored as files
- **Zero Database Setup**: No database to configure - your filesystem is the database
- **Built-in Auth**: API key authentication with expiration dates and path whitelisting
- **Instant Deployment**: Drop in a file, get an endpoint

## Installation

```bash
bun install
```

## Quick Start

```bash
# Start the server
bun index.ts
```

That's it. Server runs on port 3000 by default.

### Custom Configuration

```typescript
import { NanoWarp } from "./src";

const nw = new NanoWarp(8080, './my-data');  // custom port and data path
await nw.start();
```

## Hot-Swappable Endpoints

### Creating an Endpoint

**1. Create a file in your data directory:**

```bash
# For GET request
data/Endpoints/GET/users/list.ts

# For POST request
data/Endpoints/POST/users/create.ts
```

**2. Export an `execute` function:**

```typescript
// data/Endpoints/GET/hello.ts
export const execute = async (path: string, request: Request, Database: DataManager) => {
    return new Response('Hello World!');
};
```

**3. Hit the endpoint immediately:**

```bash
curl http://localhost:3000/api/hello
# or
curl http://localhost:3000/hello
```

No restart needed. Edit the file, refresh the request, see the changes.

### Accessing Data

```typescript
export const execute = async (path: string, request: Request, Database: DataManager) => {
    // Read a file
    const data = await Database.retrieveData('./data/users.json');

    // Write a file
    await Database.saveData('./data/users.json', JSON.stringify(data));

    // Delete a file
    await Database.deleteData('./data/old-file.json');

    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
    });
};
```

### Request Body Example

```typescript
// data/Endpoints/POST/users/create.ts
export const execute = async (path: string, request: Request, Database: DataManager) => {
    const body = await request.json();

    // Save user data
    await Database.saveData(
        `./data/users/${body.id}.json`,
        JSON.stringify(body)
    );

    return new Response('User created', { status: 201 });
};
```

## API Key Authentication

Create `data/apikeys.json`:

```json
{
  "keys": {
    "your-secret-key-here": "2025-12-31T23:59:59.000Z"
  },
  "whitelist": [
    "/health",
    "/public"
  ]
}
```

### Using API Keys

```bash
# Protected endpoint - requires API key
curl -H "X-API-Key: your-secret-key-here" \
     http://localhost:3000/api/users

# Whitelisted path - no API key needed
curl http://localhost:3000/health
```

### Key Features:
- Keys automatically expire based on the date
- Whitelisted paths bypass authentication
- File is reloaded on every request (hot-swappable auth config)
- No keys = no authentication required

## File Structure

```
data/
├── apikeys.json              # Optional: API key configuration
├── database.lock             # Auto-generated: directory index
├── Endpoints/
│   ├── GET/
│   │   └── users/
│   │       └── list.ts       # GET /api/users/list
│   └── POST/
│       └── users/
│           └── create.ts     # POST /api/users/create
└── [your data files]         # Store whatever you want
```

## Database Methods

```typescript
// Read operations
await Database.retrieveData(path)  // Returns JSON, ArrayBuffer, or directory listing

// Write operations
await Database.saveData(path, data)

// Delete operations
await Database.deleteData(path)

// Scan filesystem and rebuild index
await Database.scanDatabase()
```

## Path Routing

- `/api/users` → loads `data/Endpoints/GET/users.ts`
- `/users` → loads `data/Endpoints/GET/users.ts`
- `/api/users/list` → loads `data/Endpoints/GET/users/list.ts`

The `/api/` prefix is optional and automatically stripped.

## Use Cases

Perfect for:
- **Rapid prototyping** - No database setup, just write endpoints
- **Microservices** - Lightweight, fast startup
- **Edge computing** - Minimal dependencies
- **Configuration APIs** - File-based configs are easy to version control
- **Webhooks** - Hot-swap endpoint logic without downtime
- **Development** - Instant feedback loop

Not ideal for:
- High-concurrency writes
- Complex relational queries
- Large-scale production systems (without additional infrastructure)

## Example: Complete CRUD API

```typescript
// GET data/Endpoints/GET/todos.ts
export const execute = async (path, request, Database) => {
    const todos = await Database.retrieveData('./data/todos.json') || [];
    return new Response(JSON.stringify(todos), {
        headers: { 'Content-Type': 'application/json' }
    });
};

// POST data/Endpoints/POST/todos.ts
export const execute = async (path, request, Database) => {
    const todo = await request.json();
    const todos = await Database.retrieveData('./data/todos.json') || [];

    todos.push({ id: Date.now(), ...todo });
    await Database.saveData('./data/todos.json', JSON.stringify(todos));

    return new Response(JSON.stringify(todo), { status: 201 });
};
```

## Advanced: Dynamic Routes

The `path` parameter contains the matched route:

```typescript
// data/Endpoints/GET/users/profile.ts
export const execute = async (path, request, Database) => {
    // path = "users/profile"
    const url = new URL(request.url);
    const userId = url.searchParams.get('id');

    const user = await Database.retrieveData(`./data/users/${userId}.json`);
    return new Response(JSON.stringify(user));
};
```

Access: `GET /api/users/profile?id=123`

## Dependencies

- **Bun**: Runtime and bundler
- **fs-extra**: Filesystem utilities
- **TypeScript**: Type safety

## License

[Add your license]
