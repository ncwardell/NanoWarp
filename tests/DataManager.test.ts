import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DataManager } from '../src/database/DataManager';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-dm-'));
});

afterEach(async () => {
    await fs.remove(tmpDir);
});

describe('DataManager.initialize', () => {
    it('creates root, database.lock, and the five endpoint method directories', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();

        expect(await fs.pathExists(`${tmpDir}/database.lock`)).toBe(true);
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
            expect(await fs.pathExists(`${tmpDir}/Endpoints/${method}`)).toBe(true);
        }
    });

    it('lazy mode does not eagerly walk subtrees', async () => {
        // Pre-seed deep structure before initialize so we can observe lazy behavior.
        await fs.ensureDir(`${tmpDir}/Endpoints/GET/users/profile`);
        await fs.writeFile(`${tmpDir}/Endpoints/GET/users/profile/main.ts`, '');

        const dm = new DataManager(tmpDir);
        await dm.initialize({ lazy: true });

        // In lazy mode the root entry exists with an empty Descendants map.
        // No directory contents have been read yet — descendants must be loaded
        // explicitly via DirectoryList.loadDescendants().
        const root = dm.DataTree.DirectoryList.EntryList;
        expect(root.Type).toBe('directory');
        expect(root.Descendants).toBeDefined();
        expect(root.Descendants!.size).toBe(0);

        // After explicit load, immediate children appear (still lazy below them).
        await dm.DataTree.DirectoryList.loadDescendants(root);
        expect(root.Descendants!.has('Endpoints')).toBe(true);
        const endpoints = root.Descendants!.get('Endpoints')!;
        expect(endpoints.Type).toBe('directory');
        expect(endpoints.Descendants!.size).toBe(0);
    });
});

describe('DataManager.saveData', () => {
    it('writes the exact content to the target file', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        const target = `${tmpDir}/users.json`;

        const ok = await dm.saveData(target, JSON.stringify({ id: 1, name: 'A' }));
        expect(ok).toBe(true);
        expect(await fs.readFile(target, 'utf-8')).toBe('{"id":1,"name":"A"}');
    });

    it('cleans up the temp file after a successful write', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        const target = `${tmpDir}/clean.json`;

        await dm.saveData(target, 'x');

        const leftovers = (await fs.readdir(tmpDir)).filter(name =>
            name.startsWith('clean.json.tmp')
        );
        expect(leftovers).toEqual([]);
    });

    it('serializes concurrent writes to the same file without corruption', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        const target = `${tmpDir}/concurrent.json`;

        const writes = Array.from({ length: 50 }, (_, i) =>
            dm.saveData(target, JSON.stringify({ n: i }))
        );
        const results = await Promise.all(writes);

        expect(results.every(r => r === true)).toBe(true);
        // Final file must be valid, parseable JSON (not a half-written mix)
        const content = await fs.readFile(target, 'utf-8');
        expect(() => JSON.parse(content)).not.toThrow();
    });

    it('parallel writes to different paths complete independently', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();

        const writes = Array.from({ length: 10 }, (_, i) =>
            dm.saveData(`${tmpDir}/file-${i}.json`, JSON.stringify({ i }))
        );
        const results = await Promise.all(writes);
        expect(results.every(r => r === true)).toBe(true);

        for (let i = 0; i < 10; i++) {
            const content = await fs.readFile(`${tmpDir}/file-${i}.json`, 'utf-8');
            expect(JSON.parse(content)).toEqual({ i });
        }
    });
});

describe('DataManager.retrieveData', () => {
    it('returns false for a missing path', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        expect(await dm.retrieveData(`${tmpDir}/missing.json`)).toBe(false);
    });

    it('returns parsed JSON for .json files', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        await fs.writeFile(`${tmpDir}/user.json`, JSON.stringify({ name: 'Alice' }));
        expect(await dm.retrieveData(`${tmpDir}/user.json`)).toEqual({ name: 'Alice' });
    });

    it('returns parsed JSON for .lock files', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        await fs.writeFile(`${tmpDir}/sample.lock`, JSON.stringify({ ok: true }));
        expect(await dm.retrieveData(`${tmpDir}/sample.lock`)).toEqual({ ok: true });
    });

    it('returns a directory listing for directories', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        await fs.ensureDir(`${tmpDir}/items`);
        await fs.writeFile(`${tmpDir}/items/a.txt`, 'a');
        await fs.writeFile(`${tmpDir}/items/b.txt`, 'b');

        const listing = await dm.retrieveData(`${tmpDir}/items`);
        expect(Array.isArray(listing)).toBe(true);
        expect((listing as string[]).sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('returns an ArrayBuffer for non-JSON binary files', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        await fs.writeFile(`${tmpDir}/data.bin`, Buffer.from([10, 20, 30, 40]));

        const result = await dm.retrieveData(`${tmpDir}/data.bin`);
        expect(result instanceof ArrayBuffer).toBe(true);
        expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual([10, 20, 30, 40]);
    });
});

describe('DataManager.deleteData', () => {
    it('removes a file and returns true', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        const target = `${tmpDir}/del.txt`;
        await fs.writeFile(target, 'x');

        expect(await dm.deleteData(target)).toBe(true);
        expect(await fs.pathExists(target)).toBe(false);
    });

    it('removes a directory recursively and returns true', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        await fs.ensureDir(`${tmpDir}/nested/a/b`);
        await fs.writeFile(`${tmpDir}/nested/a/b/leaf.txt`, 'x');

        expect(await dm.deleteData(`${tmpDir}/nested`)).toBe(true);
        expect(await fs.pathExists(`${tmpDir}/nested`)).toBe(false);
    });

    it('returns false when the path does not exist', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        expect(await dm.deleteData(`${tmpDir}/nope`)).toBe(false);
    });
});

describe('DataManager.refreshPath', () => {
    it('picks up files added externally to a directory', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();

        // Add a directory and file out-of-band, then refresh.
        await fs.ensureDir(`${tmpDir}/new-dir`);
        await fs.writeFile(`${tmpDir}/new-dir/x.txt`, 'x');

        const refreshed = await dm.refreshPath('new-dir');
        expect(refreshed).not.toBeNull();
        expect(refreshed!.Type).toBe('directory');
        expect(refreshed!.Descendants?.has('x.txt')).toBe(true);

        // In-memory tree should now reflect the change too.
        const root = dm.DataTree.DirectoryList.EntryList;
        expect(root.Descendants?.get('new-dir')?.Descendants?.has('x.txt')).toBe(true);
    });

    it('returns null when the path does not exist', async () => {
        const dm = new DataManager(tmpDir);
        await dm.initialize();
        expect(await dm.refreshPath('does-not-exist')).toBeNull();
    });
});

describe('DataManager round-trip via database.lock', () => {
    it('persists directory structure and reloads it on next initialize', async () => {
        // First instance: full scan + persist.
        const dm1 = new DataManager(tmpDir);
        await dm1.initialize();
        await fs.ensureDir(`${tmpDir}/Endpoints/GET/users`);
        await fs.writeFile(`${tmpDir}/Endpoints/GET/users/list.ts`, '');
        await dm1.scanDatabase();

        // Second instance: database.lock is non-empty so it loads from disk.
        const dm2 = new DataManager(tmpDir);
        await dm2.initialize();

        const root = dm2.DataTree.DirectoryList.EntryList;
        const endpoints = root.Descendants?.get('Endpoints');
        const get = endpoints?.Descendants?.get('GET');
        const users = get?.Descendants?.get('users');

        expect(users).toBeDefined();
        expect(users?.Type).toBe('directory');
        expect(users?.Descendants?.has('list.ts')).toBe(true);
    });
});

describe('DataManager.createSchema', () => {
    it('generates an object schema with properties and required', () => {
        const schema = DataManager.createSchema('object', {
            properties: { id: { type: 'integer' }, name: { type: 'string' } },
            required: ['id'],
            description: 'A user',
        });
        expect(schema).toEqual({
            type: 'object',
            description: 'A user',
            properties: { id: { type: 'integer' }, name: { type: 'string' } },
            required: ['id'],
        });
    });

    it('generates an array schema with items', () => {
        const schema = DataManager.createSchema('array', {
            items: { type: 'string' },
        });
        expect(schema).toEqual({ type: 'array', items: { type: 'string' } });
    });

    it('generates a primitive schema', () => {
        expect(DataManager.createSchema('string', { example: 'hi' })).toEqual({
            type: 'string',
            example: 'hi',
        });
    });
});
