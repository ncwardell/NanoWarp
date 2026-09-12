#!/usr/bin/env node
/**
 * nanowarp-init — scaffold a new NanoWarp project.
 *
 * Usage:
 *   nanowarp-init [name] [--force] [--no-docker]
 *
 *   nanowarp-init                  # scaffold into current directory
 *   nanowarp-init my-api           # create ./my-api/ and scaffold
 *   nanowarp-init my-api --force   # overwrite existing files
 *   nanowarp-init my-api --no-docker  # skip docker-compose.yml
 */

import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'fs-extra';

const HELP = `
nanowarp-init — scaffold a new NanoWarp project

Usage:
  nanowarp-init [name] [options]

Arguments:
  name                Target directory. Use '.' or omit for current dir.

Options:
  --force             Overwrite existing files in the target directory.
  --no-docker         Skip docker-compose.yml.
  -h, --help          Show this help.

Creates:
  package.json                      bun-runnable project skeleton
  server.ts                         entry point
  .gitignore
  docker-compose.yml                (unless --no-docker)
  data/
  ├── apikeys.json.example          template for API-key auth
  └── Endpoints/
      ├── DELETE/
      ├── GET/
      │   └── health.ts             sample endpoint
      ├── PATCH/
      ├── POST/
      └── PUT/
`;

const PACKAGE_JSON = (name: string) => `{
  "name": "${name}",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun --watch server.ts",
    "start": "bun server.ts"
  },
  "dependencies": {
    "nanowarp": "^1.0.5"
  }
}
`;

const SERVER_TS = `import { NanoWarp } from 'nanowarp';

const server = new NanoWarp({
    port: parseInt(process.env.PORT ?? '3000', 10),
    dataPath: './data',
    logging: true,
    openapi: { enabled: true },
    // Uncomment to switch backends — endpoint code is unchanged either way.
    // database: { backend: 'sqlite' },
    // database: { backend: 'postgres', postgres: { connectionString: process.env.DATABASE_URL! } },
});

await server.start();

const port = process.env.PORT ?? '3000';
console.log(\`API running on http://localhost:\${port}\`);
console.log(\`Docs at      http://localhost:\${port}/docs\`);
`;

const HEALTH_ENDPOINT = `/**
 * GET /health — liveness probe.
 *
 * Drop additional .ts files anywhere in data/Endpoints/<METHOD>/ and they
 * become endpoints automatically. Hot-reload picks up changes instantly.
 */

export const execute = async () => {
    return new Response(JSON.stringify({
        ok: true,
        ts: new Date().toISOString(),
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
};
`;

const APIKEYS_EXAMPLE = `{
  "_comment_1": "Rename this file to apikeys.json to enable API-key auth.",
  "_comment_2": "All requests must include 'X-API-Key: <key>' unless the path is in 'whitelist'.",
  "_comment_3": "Values are ISO8601 expiration timestamps; expired keys are rejected.",
  "keys": {
    "example-key-please-rotate-this": "2026-12-31T23:59:59.000Z"
  },
  "whitelist": ["/health"]
}
`;

const GITIGNORE = `node_modules/
.env
.env.local
.env.*.local

# NanoWarp framework metadata (regenerated automatically)
data/database.lock
data/data.db
data/data.db-*

# Editor / OS
.DS_Store
.vscode/
.idea/

# Build artifacts
dist/
*.log
`;

const DOCKER_COMPOSE = `services:
  api:
    image: ncwardell/nanowarp:latest
    ports:
      - "\${PORT:-3000}:3000"
    volumes:
      # Endpoints + user data live here
      - ./data:/data
      # Mount package.json so endpoint deps auto-install on container start
      - ./package.json:/data/package.json:ro
    environment:
      OPENAPI_ENABLED: "true"
      LOGGING: "true"
      # Uncomment to switch backends:
      # DB_BACKEND: sqlite
      # DB_BACKEND: postgres
      # DATABASE_URL: postgres://user:pass@host:5432/db
    restart: unless-stopped
`;

const README_STUB = (name: string) => `# ${name}

API built with [NanoWarp](https://github.com/ncwardell/NanoWarp).

## Develop

\`\`\`bash
bun install
bun run dev      # auto-reloads on file changes
\`\`\`

Visit http://localhost:3000/health to confirm the server is up.
Visit http://localhost:3000/docs for Swagger UI.

## Add an endpoint

Drop a \`.ts\` file under \`data/Endpoints/<METHOD>/\` — that's it.

\`\`\`ts
// data/Endpoints/GET/users.ts
export const execute = async (path, request, Database) => {
    const users = await Database.retrieveData('./data/users.json') || [];
    return new Response(JSON.stringify(users), {
        headers: { 'Content-Type': 'application/json' }
    });
};
\`\`\`

The file location maps directly to the URL: \`GET /users\`.

## Deploy

\`\`\`bash
docker compose up -d
\`\`\`
`;

interface FileSpec {
    relPath: string;
    contents: string;
}

function buildFiles(name: string, withDocker: boolean): FileSpec[] {
    const files: FileSpec[] = [
        { relPath: 'package.json', contents: PACKAGE_JSON(name) },
        { relPath: 'server.ts', contents: SERVER_TS },
        { relPath: '.gitignore', contents: GITIGNORE },
        { relPath: 'README.md', contents: README_STUB(name) },
        { relPath: 'data/Endpoints/GET/health.ts', contents: HEALTH_ENDPOINT },
        { relPath: 'data/apikeys.json.example', contents: APIKEYS_EXAMPLE },
    ];
    if (withDocker) {
        files.push({ relPath: 'docker-compose.yml', contents: DOCKER_COMPOSE });
    }
    return files;
}

// Empty method directories so the user sees the layout.
const METHOD_DIRS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

async function main(): Promise<void> {
    let parsed;
    try {
        parsed = parseArgs({
            options: {
                force: { type: 'boolean', default: false },
                'no-docker': { type: 'boolean', default: false },
                help: { type: 'boolean', short: 'h', default: false },
            },
            allowPositionals: true,
            strict: true,
        });
    } catch (err: any) {
        console.error(`Argument error: ${err?.message ?? err}\n`);
        console.error(HELP);
        process.exit(2);
    }

    const { values, positionals } = parsed;
    if (values.help) {
        console.log(HELP);
        return;
    }

    const target = positionals[0] ?? '.';
    const targetPath = path.resolve(target);
    const projectName = target === '.'
        ? path.basename(process.cwd())
        : path.basename(targetPath);

    // If the target dir exists and has files, refuse unless --force.
    if (await fs.pathExists(targetPath)) {
        const entries = await fs.readdir(targetPath);
        const conflicts = entries.filter(e => !e.startsWith('.'));
        if (conflicts.length > 0 && !values.force) {
            console.error(`Target directory ${targetPath} is not empty.`);
            console.error(`Pass --force to overwrite, or pick a different name.`);
            process.exit(1);
        }
    }

    const withDocker = !values['no-docker'];
    const files = buildFiles(projectName, withDocker);

    await fs.ensureDir(targetPath);

    // Method-method directories first (some are empty)
    for (const method of METHOD_DIRS) {
        await fs.ensureDir(path.join(targetPath, 'data', 'Endpoints', method));
    }

    let written = 0;
    let skipped = 0;
    for (const f of files) {
        const dest = path.join(targetPath, f.relPath);
        if (!values.force && (await fs.pathExists(dest))) {
            console.log(`  ↷ skipping (exists): ${f.relPath}`);
            skipped++;
            continue;
        }
        await fs.ensureDir(path.dirname(dest));
        await fs.writeFile(dest, f.contents);
        console.log(`  ✓ ${f.relPath}`);
        written++;
    }

    console.log('');
    console.log(`Scaffolded "${projectName}" at ${targetPath}`);
    console.log(`  ${written} file(s) written, ${skipped} skipped`);
    console.log('');
    console.log('Next steps:');
    console.log(`  cd ${path.relative(process.cwd(), targetPath) || '.'}`);
    console.log('  bun install');
    console.log('  bun run dev');
}

await main();
