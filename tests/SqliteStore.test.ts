import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SqliteStore } from '../src/database/stores/SqliteStore';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

let tmpDir: string;
let store: SqliteStore;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-sqlite-'));
    store = new SqliteStore(path.join(tmpDir, 'data.db'));
    await store.initialize();
});

afterEach(async () => {
    await store.close();
    await fs.remove(tmpDir);
});

describe('SqliteStore — JSON values', () => {
    it('round-trips a JSON value through .json paths', async () => {
        const p = `${tmpDir}/users.json`;
        const ok = await store.saveData(p, JSON.stringify({ id: 1, name: 'Alice' }));
        expect(ok).toBe(true);

        const result = await store.retrieveData(p);
        expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('round-trips through .lock paths as JSON', async () => {
        const p = `${tmpDir}/cache.lock`;
        await store.saveData(p, JSON.stringify({ ok: true }));
        expect(await store.retrieveData(p)).toEqual({ ok: true });
    });

    it('overwrites an existing key', async () => {
        const p = `${tmpDir}/x.json`;
        await store.saveData(p, JSON.stringify({ v: 1 }));
        await store.saveData(p, JSON.stringify({ v: 2 }));
        expect(await store.retrieveData(p)).toEqual({ v: 2 });
    });
});

describe('SqliteStore — binary values', () => {
    it('stores and returns ArrayBuffer for non-JSON paths', async () => {
        const p = `${tmpDir}/blob.bin`;
        await store.saveData(p, Buffer.from([10, 20, 30, 40]));
        const result = await store.retrieveData(p);
        expect(result instanceof ArrayBuffer).toBe(true);
        expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual([10, 20, 30, 40]);
    });

    it('accepts Uint8Array and ArrayBuffer inputs', async () => {
        const a = new Uint8Array([1, 2, 3]);
        await store.saveData(`${tmpDir}/u8.bin`, a);
        await store.saveData(`${tmpDir}/ab.bin`, a.buffer);
        expect(Array.from(new Uint8Array(await store.retrieveData(`${tmpDir}/u8.bin`)))).toEqual([1, 2, 3]);
        expect(Array.from(new Uint8Array(await store.retrieveData(`${tmpDir}/ab.bin`)))).toEqual([1, 2, 3]);
    });
});

describe('SqliteStore — missing keys and directory listings', () => {
    it('returns false when nothing matches', async () => {
        expect(await store.retrieveData(`${tmpDir}/nope.json`)).toBe(false);
    });

    it('returns immediate child names when path is a "directory"', async () => {
        const root = `${tmpDir}/data`;
        await store.saveData(`${root}/a.json`, '{}');
        await store.saveData(`${root}/b.json`, '{}');
        await store.saveData(`${root}/sub/deep.json`, '{}');

        const listing = await store.retrieveData(root);
        expect(Array.isArray(listing)).toBe(true);
        // Only immediate children — 'a.json', 'b.json', 'sub'. Not 'deep.json'.
        expect(listing).toEqual(['a.json', 'b.json', 'sub']);
    });

    it('exact-match wins over directory semantics if both exist', async () => {
        const p = `${tmpDir}/dual`;
        await store.saveData(p + '.json', '{"flat": true}');
        await store.saveData(`${p}/inner.json`, '{}');
        // Asking for /dual.json gets the file, not the listing.
        expect(await store.retrieveData(p + '.json')).toEqual({ flat: true });
    });
});

describe('SqliteStore — deletion', () => {
    it('deletes an exact key and returns true', async () => {
        const p = `${tmpDir}/x.json`;
        await store.saveData(p, '{}');
        expect(await store.deleteData(p)).toBe(true);
        expect(await store.retrieveData(p)).toBe(false);
    });

    it('returns false when nothing was deleted', async () => {
        expect(await store.deleteData(`${tmpDir}/missing.json`)).toBe(false);
    });

    it('recursively deletes everything under a directory-style path', async () => {
        const root = `${tmpDir}/items`;
        await store.saveData(`${root}/a.json`, '{}');
        await store.saveData(`${root}/sub/b.json`, '{}');
        await store.saveData(`${root}/sub/deeper/c.json`, '{}');
        // Also a sibling NOT under /items — must be untouched.
        await store.saveData(`${tmpDir}/sibling.json`, '{}');

        expect(await store.deleteData(root)).toBe(true);

        // All three under /items are gone
        expect(await store.retrieveData(`${root}/a.json`)).toBe(false);
        expect(await store.retrieveData(`${root}/sub/b.json`)).toBe(false);
        expect(await store.retrieveData(`${root}/sub/deeper/c.json`)).toBe(false);
        // Sibling preserved
        expect(await store.retrieveData(`${tmpDir}/sibling.json`)).toEqual({});
    });
});

describe('SqliteStore — persistence across instances', () => {
    it('data written by one store instance is visible to a fresh one', async () => {
        const p = `${tmpDir}/persist.json`;
        await store.saveData(p, JSON.stringify({ saved: 'before close' }));
        await store.close();

        const fresh = new SqliteStore(path.join(tmpDir, 'data.db'));
        await fresh.initialize();
        try {
            expect(await fresh.retrieveData(p)).toEqual({ saved: 'before close' });
        } finally {
            await fresh.close();
        }
    });
});
