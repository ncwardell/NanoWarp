# NanoWarp

A lightning-fast, modular API framework built on Bun, featuring a compact, custom filesystem-based database for seamless data integration.

## Overview

NanoWarp is a TypeScript-based API framework that combines the speed of Bun runtime with a unique filesystem-based database approach. It provides a minimal yet powerful foundation for building RESTful APIs with built-in authentication, dynamic endpoint routing, and persistent data storage.

## Features

- **Filesystem-based Database**: Custom database implementation that maps directory structures and persists metadata
- **Dynamic Endpoint Routing**: Load and execute endpoints dynamically from the filesystem
- **API Key Authentication**: Built-in authentication with expiration date support and path whitelisting
- **Bun Runtime**: Leverages Bun's performance for fast startup and execution
- **Type-Safe**: Fully written in TypeScript with strict compiler options
- **Modular Architecture**: Clean separation of concerns between server, database, and routing logic

## Project Structure

```
NanoWarp/
├── src/
│   ├── index.ts                  # Main NanoWarp class
│   ├── database/
│   │   ├── DataManager.ts        # Database operations and management
│   │   └── DirectoryList.ts      # Directory mapping and traversal
│   ├── server/
│   │   ├── server.ts             # HTTP server implementation
│   │   └── routes/
│   │       ├── getREQ.ts         # GET request handler
│   │       └── postREQ.ts        # POST request handler
│   └── helpers/
│       ├── colors.ts             # Terminal color utilities
│       └── mappingString.ts      # JSON serialization for Map objects
├── index.ts                      # Application entry point
├── package.json
└── tsconfig.json
```

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/NanoWarp.git
cd NanoWarp

# Install dependencies
bun install
```

## Quick Start

```typescript
import { NanoWarp } from "./src";

// Create a new NanoWarp instance
let nw = new NanoWarp(3000, './data');

// Start the server and database
await nw.start();
```

### Basic Configuration

```typescript
// Custom port and data directory
const nw = new NanoWarp(8080, './my-data');
await nw.start();
```

## Core Components

### 1. NanoWarp Class (src/index.ts)

The main orchestrator that initializes and coordinates the database and server components.

```typescript
class NanoWarp {
    Database: DataManager;
    APIServer: Server;
    DataPath: string;

    constructor(port = 3000, _dataPath = './data');
    async start();
}
```

### 2. DataManager (src/database/DataManager.ts)

Manages all database operations including:
- File and directory CRUD operations
- Database serialization/deserialization
- Directory tree scanning and mapping
- Data persistence to `database.lock` file

**Key Methods:**
- `initialize()`: Sets up database structure and loads existing data
- `retrieveData(path)`: Reads files, directories, or JSON data
- `saveData(path, data)`: Writes data to filesystem
- `deleteData(path)`: Removes files or directories
- `scanDatabase()`: Rebuilds directory map from filesystem
- `loadDataBase(path)`: Loads database from lock file
- `saveDataBase()`: Persists database state to lock file

### 3. DirectoryList (src/database/DirectoryList.ts)

Provides directory structure mapping and querying capabilities.

**DirectoryEntry Interface:**
```typescript
interface DirectoryEntry {
    Type: "file" | "directory" | "temp";
    Path: string;
    Descendants?: Map<string, DirectoryEntry>;
}
```

**Key Methods:**
- `buildDirectoryMap(path)`: Recursively maps directory structure
- `getEntry(target)`: Queries directory tree for specific paths
- `ensurePaths()`: Creates missing directories/files from the map
- `clearEntryBuffer()`: Clears query cache

### 4. Server (src/server/server.ts)

HTTP server with authentication and routing.

**Features:**
- API key authentication with expiration dates
- Path-based whitelisting
- Dynamic endpoint loading
- Request logging with colored output

**Authentication:**
API keys are stored in `{dataPath}/apikeys.json`:
```json
{
  "keys": {
    "your-api-key-here": "2025-12-31T23:59:59.000Z"
  },
  "whitelist": [
    "/health",
    "/public"
  ]
}
```

### 5. Dynamic Endpoint Routing

Endpoints are loaded dynamically from the filesystem:
- GET endpoints: `{dataPath}/Endpoints/GET/{route}.ts`
- POST endpoints: `{dataPath}/Endpoints/POST/{route}.ts`

**Endpoint Structure:**
```typescript
// Example: data/Endpoints/GET/users.ts
export const execute = async (path: string, request: Request, Database: DataManager) => {
    // Your endpoint logic here
    const data = await Database.retrieveData('./users.json');
    return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' }
    });
};
```

## Database Structure

### Filesystem-based Approach

NanoWarp uses a hybrid filesystem database approach:

1. **Physical Storage**: All data is stored as files and directories in the configured data path
2. **Metadata Persistence**: Directory structure is mapped and cached in `database.lock`
3. **In-Memory Index**: DirectoryList maintains a navigable tree structure in memory

### Data Directory Layout

```
data/
├── database.lock              # Serialized directory map and metadata
├── apikeys.json              # API authentication configuration
├── Endpoints/
│   ├── GET/                  # GET endpoint modules
│   │   └── {route}.ts
│   └── POST/                 # POST endpoint modules
│       └── {route}.ts
└── [your data files/folders]
```

### Database Operations Flow

1. **Initialization**:
   - Creates data directory structure
   - Loads or creates `database.lock`
   - Scans filesystem to build/update directory map

2. **Read Operations**:
   - Checks path existence
   - Returns directory listings, JSON data, or file buffers
   - Utilizes directory map for fast lookups

3. **Write Operations**:
   - Writes data to filesystem
   - Updates in-memory directory map
   - Persists changes to `database.lock`

4. **Query Operations**:
   - Uses DirectoryList to navigate tree structure
   - Maintains entry buffer for query results
   - Supports recursive directory traversal

## API Usage

### Making Requests

```bash
# Without API key (whitelisted path)
curl http://localhost:3000/api/health

# With API key
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/users

# POST request
curl -X POST -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json" \
     -d '{"name":"John"}' \
     http://localhost:3000/api/users/create
```

### Path Handling

- Paths starting with `/api/` have the prefix stripped before routing
- Example: `/api/users/list` routes to `data/Endpoints/GET/users/list.ts`
- Path parts are joined with `/` to form the module path

## Development

### Running the Application

```bash
# Development mode
bun run index.ts

# Or using Bun directly
bun index.ts
```

### Creating Custom Endpoints

1. Create a TypeScript file in the appropriate endpoint directory:
   ```bash
   mkdir -p data/Endpoints/GET
   touch data/Endpoints/GET/myendpoint.ts
   ```

2. Implement the execute function:
   ```typescript
   import type { DataManager } from "../../src/database/DataManager";

   export const execute = async (
       path: string,
       request: Request,
       Database: DataManager
   ): Promise<Response> => {
       // Your logic here
       return new Response('Hello from custom endpoint!');
   };
   ```

3. Access the endpoint:
   ```bash
   curl http://localhost:3000/api/myendpoint
   ```

## Configuration

### TypeScript Configuration

The project uses strict TypeScript settings:
- Target: ESNext
- Module: ESNext
- Strict mode enabled
- Bundler module resolution
- No emit (Bun handles runtime)

### Dependencies

- **fs-extra**: Enhanced filesystem operations
- **csv-parse**: CSV parsing support
- **@types/bun**: Bun runtime type definitions

## Logging and Debugging

NanoWarp provides colored console output for easy debugging:
- **Green**: Request information
- **Blue**: HTTP methods
- **Cyan**: Paths
- **Orange**: Execution confirmations
- **Yellow**: Status updates
- **Magenta**: Database operations
- **Red**: Errors

## Security Considerations

1. **API Key Storage**: API keys are stored in plain JSON - consider encryption for production
2. **Endpoint Execution**: Endpoints are dynamically imported - ensure proper access controls
3. **Path Traversal**: No built-in path traversal protection - validate paths in endpoints
4. **Authentication**: Basic API key auth - consider OAuth2/JWT for production

## Performance Characteristics

- **Startup Time**: Fast due to Bun runtime and minimal dependencies
- **Endpoint Loading**: Dynamic imports with timestamp-based cache busting
- **Database Operations**: Filesystem-based, suitable for small to medium datasets
- **Memory Usage**: Directory map kept in memory, scales with filesystem size

## Limitations

- Not suitable for high-concurrency write scenarios
- No built-in transaction support
- No query language (filesystem-based access only)
- Directory map must fit in memory
- Limited scalability compared to traditional databases

## Use Cases

NanoWarp is ideal for:
- Rapid API prototyping
- Small to medium data storage needs
- File-based content management
- Configuration management APIs
- Edge computing scenarios
- Embedded API servers
- Development and testing environments

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure TypeScript strict mode compliance
5. Submit a pull request

## License

[Add your license here]

## Author

[Add author information]

## Acknowledgments

Built with:
- [Bun](https://bun.sh/) - Fast all-in-one JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) - Typed JavaScript
- [fs-extra](https://github.com/jprichardson/node-fs-extra) - Enhanced filesystem methods
