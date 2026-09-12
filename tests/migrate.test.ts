import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { FilesystemStore } from '../src/database/stores/FilesystemStore';
import { SqliteStore } from '../src/database/stores/SqliteStore';
import { migrate, DEFAULT_SKIP_PATTERNS } from '../src/database/migrate';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-migrate-'));
});

afterEach(async () => {
    await fs.remove(tmpDir);
});

describe('migrate filesystem → sqlite', () => {
    it('copies user data, preserves JSON values, skips framework metadata', async () => {
        // Framework artifacts that MUST NOT be migrated.
        await fs.ensureDir(`${tmpDir}/Endpoints/GET`);
        await fs.writeFile(
            `${tmpDir}/Endpoints/GET/health.ts`,
            'export const execute = async () => new Response("ok");'
        );
        await fs.writeFile(`${tmpDir}/database.lock`, JSON.stringify({}));

        // User data — these should round-trip.
        await fs.writeFile(`${tmpDir}/users.json`, JSON.stringify([{ id: 1, name: 'Alice' }]));
        await fs.ensureDir(`${tmpDir}/nested`);
        await fs.writeFile(`${tmpDir}/nested/data.json`, JSON.stringify({ key: 'value' }));
        await fs.writeFile(`${tmpDir}/blob.bin`, Buffer.from([1, 2, 3, 4]));

        const fromStore = new FilesystemStore();
        const toStore = new SqliteStore(`${tmpDir}/data.db`);
        await toStore.initialize();

        const result = await migrate({
            from: fromStore,
            to: toStore,
            prefix: tmpDir,
        });
        await toStore.close();

        expect(result.failed).toBe(0);
        expect(result.errors).toEqual([]);
        // Three user-data files should have made it across.
        expect(result.migrated).toBe(3);
        expect(result.skipped).toBeGreaterThan(0); // Endpoints/* + database.lock at least

        // Verify what's actually in SQLite.
        const verify = new SqliteStore(`${tmpDir}/data.db`);
        await verify.initialize();
        try {
            expect(await verify.retrieveData(`${tmpDir}/users.json`))
                .toEqual([{ id: 1, name: 'Alice' }]);
            expect(await verify.retrieveData(`${tmpDir}/nested/data.json`))
                .toEqual({ key: 'value' });

            const blob = await verify.retrieveData(`${tmpDir}/blob.bin`);
            expect(blob instanceof ArrayBuffer).toBe(true);
            expect(Array.from(new Uint8Array(blob as ArrayBuffer))).toEqual([1, 2, 3, 4]);

            // Framework metadata MUST NOT have been migrated.
            expect(await verify.retrieveData(`${tmpDir}/database.lock`)).toBe(false);
            expect(await verify.retrieveData(`${tmpDir}/Endpoints/GET/health.ts`)).toBe(false);
        } finally {
            await verify.close();
        }
    });

    it('source filesystem files remain in place (non-destructive)', async () => {
        await fs.writeFile(`${tmpDir}/x.json`, '{}');
        const target = new SqliteStore(`${tmpDir}/data.db`);
        await target.initialize();

        await migrate({ from: new FilesystemStore(), to: target, prefix: tmpDir });
        await target.close();

        expect(await fs.pathExists(`${tmpDir}/x.json`)).toBe(true);
    });
});

describe('migrate sqlite → filesystem', () => {
    it('exports SQLite rows back to disk files at their original paths', async () => {
        const sqlite = new SqliteStore(`${tmpDir}/data.db`);
        await sqlite.initialize();

        await sqlite.saveData(`${tmpDir}/items.json`, JSON.stringify([{ id: 1 }]));
        await sqlite.saveData(`${tmpDir}/nested/x.json`, JSON.stringify({ y: 'z' }));
        await sqlite.saveData(`${tmpDir}/blob.bin`, Buffer.from([10, 20, 30]));

        // SqliteStore.saveData doesn't create parent dirs (it's a KV store), but
        // FilesystemStore.saveData also expects the parent to exist. We need to
        // pre-create directory structure for the FS target. Real users would do
        // this manually too. For the test, do it explicitly.
        await fs.ensureDir(`${tmpDir}/nested`);

        const result = await migrate({
            from: sqlite,
            to: new FilesystemStore(),
            prefix: tmpDir,
        });
        await sqlite.close();

        expect(result.failed).toBe(0);
        expect(result.migrated).toBe(3);

        expect(JSON.parse(await fs.readFile(`${tmpDir}/items.json`, 'utf-8')))
            .toEqual([{ id: 1 }]);
        expect(JSON.parse(await fs.readFile(`${tmpDir}/nested/x.json`, 'utf-8')))
            .toEqual({ y: 'z' });

        const blob = await fs.readFile(`${tmpDir}/blob.bin`);
        expect(Array.from(blob)).toEqual([10, 20, 30]);
    });
});

describe('migrate dry-run', () => {
    it('reports counts but does not write to target', async () => {
        await fs.writeFile(`${tmpDir}/a.json`, JSON.stringify({ a: 1 }));
        await fs.writeFile(`${tmpDir}/b.json`, JSON.stringify({ b: 2 }));

        const target = new SqliteStore(`${tmpDir}/data.db`);
        await target.initialize();

        const result = await migrate({
            from: new FilesystemStore(),
            to: target,
            prefix: tmpDir,
            dryRun: true,
        });

        expect(result.migrated).toBe(2);
        expect(result.failed).toBe(0);
        expect(await target.retrieveData(`${tmpDir}/a.json`)).toBe(false);
        expect(await target.retrieveData(`${tmpDir}/b.json`)).toBe(false);

        await target.close();
    });
});

describe('migrate skip patterns', () => {
    it('default patterns skip Endpoints/, database.lock, and data.db', async () => {
        // Source filesystem with framework metadata mixed in
        await fs.writeFile(`${tmpDir}/database.lock`, '{}');
        await fs.ensureDir(`${tmpDir}/Endpoints/GET`);
        await fs.writeFile(`${tmpDir}/Endpoints/GET/foo.ts`, '');
        await fs.writeFile(`${tmpDir}/data.db`, 'fake-db'); // pretend SQLite file
        await fs.writeFile(`${tmpDir}/data.db-journal`, 'fake-journal');
        await fs.writeFile(`${tmpDir}/real-data.json`, '{"x": 1}');

        // Put the target's storage outside the source tree so the test
        // measures default skips, not destination self-skipping.
        const targetDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-migrate-target-'));
        const target = new SqliteStore(`${targetDir}/sink.db`);
        await target.initialize();

        try {
            const result = await migrate({
                from: new FilesystemStore(),
                to: target,
                prefix: tmpDir,
            });

            // Only real-data.json should have been migrated; the four
            // framework / SQLite-sidecar files are skipped by default patterns.
            expect(result.migrated).toBe(1);
            expect(result.skipped).toBe(4);
        } finally {
            await target.close();
            await fs.remove(targetDir);
        }
    });

    it('custom skipPatterns can override defaults', async () => {
        await fs.writeFile(`${tmpDir}/secret.json`, '{}');
        await fs.writeFile(`${tmpDir}/public.json`, '{}');

        const target = new SqliteStore(`${tmpDir}/sink.db`);
        await target.initialize();

        const result = await migrate({
            from: new FilesystemStore(),
            to: target,
            prefix: tmpDir,
            skipPatterns: ['secret', '/sink.db'],
        });
        await target.close();

        expect(result.migrated).toBe(1); // only public.json
        expect(result.skipped).toBeGreaterThanOrEqual(1);
    });

    it('exposes the default skip list as DEFAULT_SKIP_PATTERNS', () => {
        expect(DEFAULT_SKIP_PATTERNS).toContain('/database.lock');
        expect(DEFAULT_SKIP_PATTERNS).toContain('/Endpoints/');
        expect(DEFAULT_SKIP_PATTERNS).toContain('/data.db');
    });
});

describe('migrate error handling', () => {
    it('throws if source store does not implement listEntries', async () => {
        const noEnum = {
            async retrieveData() { return false; },
            async saveData() { return true; },
            async deleteData() { return false; },
        };
        await expect(
            migrate({ from: noEnum as any, to: new FilesystemStore(), prefix: tmpDir })
        ).rejects.toThrow(/listEntries/);
    });

    it('records per-entry failures without aborting the whole run', async () => {
        await fs.writeFile(`${tmpDir}/a.json`, '{"a":1}');
        await fs.writeFile(`${tmpDir}/b.json`, '{"b":2}');

        // Target store that fails on a specific path.
        const fakeTarget = {
            async retrieveData() { return false; },
            async saveData(p: string) { return !p.endsWith('a.json'); },
            async deleteData() { return false; },
        };

        const result = await migrate({
            from: new FilesystemStore(),
            to: fakeTarget as any,
            prefix: tmpDir,
        });

        expect(result.migrated).toBe(1); // b.json
        expect(result.failed).toBe(1);   // a.json
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].path).toContain('a.json');
    });
});
