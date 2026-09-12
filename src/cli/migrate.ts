#!/usr/bin/env node
/**
 * nanowarp-migrate — migrate user data between filesystem and SQLite backends.
 *
 * Usage:
 *   nanowarp-migrate --data-path ./data --from filesystem --to sqlite
 *   nanowarp-migrate --data-path ./data --from sqlite --to filesystem
 */

import { parseArgs } from 'node:util';
import path from 'node:path';
import { FilesystemStore } from '../database/stores/FilesystemStore';
import { SqliteStore } from '../database/stores/SqliteStore';
import { migrate } from '../database/migrate';
import type { DataStore } from '../database/stores/DataStore';

const HELP = `
nanowarp-migrate — migrate user data between filesystem and SQLite backends

Usage:
  nanowarp-migrate --data-path <path> --from <backend> --to <backend> [options]

Required:
  --data-path <path>      Path to the NanoWarp data directory.
  --from <backend>        Source backend:  'filesystem' | 'sqlite'
  --to   <backend>        Target backend:  'filesystem' | 'sqlite'

Options:
  --sqlite-path <path>    SQLite database file location.
                          Default: <data-path>/data.db
  --dry-run               Enumerate and report without writing anything.
  --quiet                 Suppress per-entry progress output.
  -h, --help              Show this help.

Examples:
  # Move user data from filesystem files into a single SQLite database
  nanowarp-migrate --data-path ./data --from filesystem --to sqlite

  # Export from SQLite back to filesystem files
  nanowarp-migrate --data-path ./data --from sqlite --to filesystem

  # Preview a migration without writing
  nanowarp-migrate --data-path ./data --from filesystem --to sqlite --dry-run

Notes:
  - Endpoint files (Endpoints/**.ts) and database.lock are framework
    metadata. They are always kept on the filesystem and never migrated.
  - The default SQLite file (data.db plus its WAL/journal sidecars) is
    also skipped automatically.
  - The migration is non-destructive: source data is left in place. After
    verifying the target, delete or archive the source data manually.
`;

function fail(msg: string, exitCode: number = 1): never {
    console.error(msg);
    process.exit(exitCode);
}

async function main(): Promise<void> {
    let parsed;
    try {
        parsed = parseArgs({
            options: {
                'data-path': { type: 'string' },
                'from': { type: 'string' },
                'to': { type: 'string' },
                'sqlite-path': { type: 'string' },
                'dry-run': { type: 'boolean', default: false },
                'quiet': { type: 'boolean', default: false },
                'help': { type: 'boolean', short: 'h', default: false },
            },
            strict: true,
        });
    } catch (err: any) {
        console.error(`Argument error: ${err?.message ?? err}`);
        console.error(HELP);
        process.exit(2);
    }

    const v = parsed.values;

    if (v.help) {
        console.log(HELP);
        return;
    }

    if (!v['data-path'] || !v.from || !v.to) {
        console.error('Missing required arguments.\n');
        console.error(HELP);
        process.exit(2);
    }

    if (v.from === v.to) {
        fail(`--from and --to must differ (got '${v.from}').`, 2);
    }

    if (v.from !== 'filesystem' && v.from !== 'sqlite') {
        fail(`Invalid --from: '${v.from}'. Expected 'filesystem' or 'sqlite'.`, 2);
    }
    if (v.to !== 'filesystem' && v.to !== 'sqlite') {
        fail(`Invalid --to: '${v.to}'. Expected 'filesystem' or 'sqlite'.`, 2);
    }

    const dataPath = path.resolve(v['data-path']!);
    const sqlitePath = v['sqlite-path']
        ? path.resolve(v['sqlite-path'])
        : path.join(dataPath, 'data.db');

    const makeStore = async (name: 'filesystem' | 'sqlite'): Promise<DataStore> => {
        if (name === 'filesystem') return new FilesystemStore();
        const s = new SqliteStore(sqlitePath);
        await s.initialize();
        return s;
    };

    const fromStore = await makeStore(v.from as 'filesystem' | 'sqlite');
    const toStore = await makeStore(v.to as 'filesystem' | 'sqlite');

    console.log(`Migrating ${v.from} → ${v.to}`);
    console.log(`  data path:  ${dataPath}`);
    if (v.from === 'sqlite' || v.to === 'sqlite') {
        console.log(`  sqlite db:  ${sqlitePath}`);
    }
    if (v['dry-run']) console.log('  (dry run — no changes will be written)');
    console.log('');

    const result = await migrate({
        from: fromStore,
        to: toStore,
        prefix: dataPath,
        dryRun: v['dry-run'],
        onProgress: v.quiet
            ? undefined
            : ({ path, index }) => console.log(`  [${String(index).padStart(4)}] ${path}`),
    });

    await fromStore.close?.();
    await toStore.close?.();

    console.log('');
    console.log(`Done. migrated=${result.migrated} skipped=${result.skipped} failed=${result.failed}`);

    if (result.errors.length > 0) {
        console.log('');
        console.log('Errors:');
        for (const e of result.errors) {
            console.log(`  ${e.path}: ${e.error}`);
        }
        process.exit(1);
    }
}

await main();
