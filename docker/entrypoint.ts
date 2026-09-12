/**
 * Containerized entrypoint for NanoWarp.
 *
 * All configuration is environment-driven so the same image runs anywhere
 * via `docker run -e ...` or compose `environment:`. Endpoint files come
 * from the volume mounted at $DATA_PATH (default /data).
 *
 * Auto-install: if $DATA_PATH/package.json exists, runs `bun install` in
 * $DATA_PATH before starting the server. Endpoints can then import any
 * package listed in that package.json. Disable with INSTALL_ON_START=false.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { NanoWarp } from '../src/index';

const num = (key: string, fallback: number): number => {
    const v = process.env[key];
    if (v === undefined || v === '') return fallback;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) {
        console.error(`Invalid integer for ${key}: ${v}`);
        process.exit(1);
    }
    return n;
};

const bool = (key: string, fallback: boolean): boolean => {
    const v = process.env[key];
    if (v === undefined || v === '') return fallback;
    return v === '1' || v.toLowerCase() === 'true';
};

const backendStr = (process.env.DB_BACKEND ?? 'filesystem').toLowerCase();
if (backendStr !== 'filesystem' && backendStr !== 'sqlite') {
    console.error(`Invalid DB_BACKEND: ${backendStr}. Expected 'filesystem' or 'sqlite'.`);
    process.exit(1);
}

const port = num('PORT', 3000);
const dataPath = process.env.DATA_PATH ?? '/data';
const logging = bool('LOGGING', true);
const openapiEnabled = bool('OPENAPI_ENABLED', false);

// Path to the framework copy bundled into the image (laid out as a real
// npm package — has package.json + src/ + node_modules/).
const FRAMEWORK_ROOT = '/app';

/**
 * Step 1: Decide what to do with the user's endpoint dependencies.
 *
 *  - If /data/node_modules already exists → trust it, no install (fast path).
 *    Use case: user pre-installed on host or extended the image with deps.
 *  - Else if /data/package.json exists → run `bun install` (Option C).
 *  - Else → create an empty /data/node_modules so we can drop the framework
 *    symlink into it later.
 */
async function installUserDeps(): Promise<void> {
    const userNodeModules = path.join(dataPath, 'node_modules');
    const userPkg = path.join(dataPath, 'package.json');

    if (await fs.pathExists(userNodeModules)) {
        console.log(`📦 Using existing node_modules at ${userNodeModules}`);
        return;
    }

    if (!bool('INSTALL_ON_START', true)) {
        await fs.ensureDir(userNodeModules);
        return;
    }

    if (await fs.pathExists(userPkg)) {
        console.log(`📦 Found ${userPkg} — installing endpoint dependencies...`);
        const proc = Bun.spawn(['bun', 'install'], {
            cwd: dataPath,
            stdout: 'inherit',
            stderr: 'inherit',
        });
        const exitCode = await proc.exited;
        if (exitCode !== 0) {
            console.error(`❌ bun install failed (exit code ${exitCode})`);
            process.exit(1);
        }
        console.log(`✓ Endpoint dependencies ready in ${userNodeModules}`);
        return;
    }

    // No package.json, no node_modules. Create empty node_modules so the
    // framework symlink has a place to live (so endpoints can still
    // `import 'nanowarp'`).
    await fs.ensureDir(userNodeModules);
}

/**
 * Step 2: Ensure `import 'nanowarp'` works from any endpoint, regardless of
 * how the user set up their dependencies.
 *
 * If the user explicitly installed nanowarp (it appears in their
 * node_modules), leave that copy alone — the user's pinned version wins.
 * Otherwise, symlink the framework copy bundled into the image.
 */
async function ensureFrameworkLinked(): Promise<void> {
    const userNodeModules = path.join(dataPath, 'node_modules');
    const linkPath = path.join(userNodeModules, 'nanowarp');

    if (await fs.pathExists(linkPath)) return; // user has their own copy

    await fs.symlink(FRAMEWORK_ROOT, linkPath, 'dir');
    console.log(`🔗 Linked bundled nanowarp → ${linkPath}`);
}

await installUserDeps();
await ensureFrameworkLinked();

const server = new NanoWarp({
    port,
    dataPath,
    logging,
    cache: {
        apiKeyTTL: num('API_KEY_TTL', 60000),
        moduleCacheSize: num('MODULE_CACHE_SIZE', 100),
    },
    timeout: {
        request: num('REQUEST_TIMEOUT', 30000),
        shutdown: num('SHUTDOWN_TIMEOUT', 30000),
    },
    openapi: {
        enabled: openapiEnabled,
        specPath: process.env.OPENAPI_SPEC_PATH ?? '/openapi.json',
        uiPath: process.env.OPENAPI_UI_PATH ?? '/docs',
        info: {
            title: process.env.OPENAPI_TITLE ?? 'NanoWarp API',
            version: process.env.OPENAPI_VERSION ?? '1.0.0',
            description: process.env.OPENAPI_DESCRIPTION,
        },
    },
    database: {
        backend: backendStr as 'filesystem' | 'sqlite',
        sqlite: process.env.SQLITE_PATH ? { path: process.env.SQLITE_PATH } : undefined,
    },
});

await server.start();

console.log('');
console.log('--- NanoWarp container ready ---');
console.log(`  port:     ${port}`);
console.log(`  dataPath: ${dataPath}`);
console.log(`  backend:  ${backendStr}`);
console.log(`  logging:  ${logging}`);
console.log(`  openapi:  ${openapiEnabled}${openapiEnabled ? ` → http://localhost:${port}${process.env.OPENAPI_UI_PATH ?? '/docs'}` : ''}`);
console.log('');
