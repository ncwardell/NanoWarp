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

## Creating Your Own Server

```typescript
import { NanoWarp } from "nanowarp";

const server = new NanoWarp(8080, './my-data');
await server.start();
```

See the main [README](../README.md) for full documentation.
