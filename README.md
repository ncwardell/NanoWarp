# NanoWarp

Lightning-fast API framework built on Bun with **hot-swappable file-based endpoints**.

## The Idea

Drop a `.ts` file in a folder → instant API endpoint. Edit it → changes apply immediately. No restart, no rebuild, no config.

```typescript
// data/Endpoints/GET/hello.ts
export const execute = async (path, request, Database) => {
    return new Response('Hello World!');
};
```

**That's it.** Hit `http://localhost:3000/hello` and it works.

## Features

- **Hot Reload** - Edit endpoints, see changes instantly (file watcher detects changes)
- **File-Based Storage** - Your filesystem IS the database
- **API Key Auth** - Built-in with expiration dates and path whitelisting
- **Atomic Writes** - No data corruption from concurrent operations
- **Zero Config** - No database setup, no migrations, just files
- **Production Ready** - Error boundaries, graceful shutdown, request timeouts

## Quick Start

```bash
bun install
bun index.ts
```

Server runs on port 3000. Change port or data path:

```typescript
import { NanoWarp } from "./src";
const nw = new NanoWarp(8080, './my-data');
await nw.start();
```

## Creating Endpoints

**File location = URL path:**

```
data/Endpoints/GET/users.ts       → GET /users
data/Endpoints/POST/users.ts      → POST /users
data/Endpoints/GET/users/list.ts  → GET /users/list
```

**Every endpoint exports an `execute` function:**

```typescript
export const execute = async (path: string, request: Request, Database: DataManager) => {
    // Your logic here
    return new Response('response', { status: 200 });
};
```

## Working with Data

```typescript
// Read
const data = await Database.retrieveData('./data/users.json');

// Write (atomic + locked)
await Database.saveData('./data/users.json', JSON.stringify(data));

// Delete
await Database.deleteData('./data/users.json');
```

Returns JSON for `.json` files, ArrayBuffer for others, or directory listing for folders.

## Complete Example: TODO API

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
    const body = await request.json();
    const todos = await Database.retrieveData('./data/todos.json') || [];

    todos.push({ id: Date.now(), ...body });
    await Database.saveData('./data/todos.json', JSON.stringify(todos));

    return new Response(JSON.stringify(body), { status: 201 });
};
```

Access: `GET /todos`, `POST /todos`

## API Key Authentication

Create `data/apikeys.json`:

```json
{
  "keys": {
    "secret-key-123": "2025-12-31T23:59:59.000Z"
  },
  "whitelist": ["/public", "/health"]
}
```

Use in requests:

```bash
curl -H "X-API-Key: secret-key-123" http://localhost:3000/users
```

- Keys auto-expire based on date
- Whitelisted paths skip auth
- Cached for 60s (configurable)
- No keys = no auth required

## URL Params & Query Strings

```typescript
export const execute = async (path, request, Database) => {
    const url = new URL(request.url);
    const userId = url.searchParams.get('id');

    const user = await Database.retrieveData(`./data/users/${userId}.json`);
    return new Response(JSON.stringify(user));
};
```

Access: `GET /users/profile?id=123`

## Production Features

✅ **Error Boundaries** - Endpoints can crash without killing server
✅ **30s Timeout** - Auto-kills infinite loops
✅ **Atomic Writes** - Write to temp file → atomic rename
✅ **File Locks** - Concurrent write protection
✅ **Graceful Shutdown** - SIGTERM/SIGINT handling, waits for in-flight requests
✅ **Hot Reload** - File watcher auto-detects changes, no manual restart

## File Structure

```
data/
├── apikeys.json              # Optional: auth config
├── database.lock             # Auto-generated: directory index
├── Endpoints/
│   ├── GET/
│   │   └── users.ts          # GET /users
│   └── POST/
│       └── users.ts          # POST /users
└── users.json                # Your data (any structure)
```

## Use Cases

**Perfect for:**
- Rapid prototyping (zero setup)
- Microservices (fast startup, small footprint)
- Webhooks (hot-swap logic without downtime)
- Edge/embedded systems (minimal dependencies)
- Version-controlled APIs (endpoints are just files)

**Not for:**
- High-concurrency writes to same file
- Complex relational queries (use SQLite)
- Netflix-scale traffic (use traditional DB + caching)

## How It Works

1. **Module Caching** - Endpoints cached until file changes
2. **File Watching** - `fs.watch()` detects edits, clears cache
3. **Version Busting** - `import(path?v=2)` forces fresh import
4. **Atomic Writes** - Write to `.tmp` → `fs.rename()` (POSIX atomic)
5. **Mutex Locks** - Per-file write queue prevents corruption

## Dependencies

- **Bun** - Runtime
- **fs-extra** - Filesystem utilities
- **TypeScript** - Type safety
