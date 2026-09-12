/**
 * Postgres backend tests.
 *
 * These require a running Postgres reachable via TEST_POSTGRES_URL. When
 * that env var is unset, the suite skips itself rather than failing — so
 * CI without a Postgres service still passes.
 *
 * Run locally:
 *   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=test postgres:16
 *   TEST_POSTGRES_URL=postgres://postgres:test@localhost:5432/postgres bun test
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { PostgresStore } from '../src/database/stores/PostgresStore';

const POSTGRES_URL = process.env.TEST_POSTGRES_URL;

const maybe = POSTGRES_URL ? describe : describe.skip;

// Each test uses a unique table name so suites can run in parallel and
// don't need an explicit teardown.
const uniqueTable = () => `nw_test_${Math.random().toString(36).slice(2, 10)}`;

maybe('PostgresStore — JSON values', () => {
    let store: PostgresStore;
    let table: string;

    beforeEach(async () => {
        table = uniqueTable();
        store = new PostgresStore({ connectionString: POSTGRES_URL!, tableName: table });
        await store.initialize();
    });

    afterEach(async () => {
        // @ts-ignore — tap into the pool to drop the test table
        await (store as any).pool?.query?.(`DROP TABLE IF EXISTS ${table}`);
        await store.close();
    });

    it('round-trips a JSON value through .json paths', async () => {
        await store.saveData('/tmp/x/users.json', JSON.stringify({ id: 1, name: 'Alice' }));
        expect(await store.retrieveData('/tmp/x/users.json')).toEqual({ id: 1, name: 'Alice' });
    });

    it('overwrites an existing key', async () => {
        await store.saveData('/tmp/x/y.json', JSON.stringify({ v: 1 }));
        await store.saveData('/tmp/x/y.json', JSON.stringify({ v: 2 }));
        expect(await store.retrieveData('/tmp/x/y.json')).toEqual({ v: 2 });
    });
});

maybe('PostgresStore — binary values', () => {
    let store: PostgresStore;
    let table: string;

    beforeEach(async () => {
        table = uniqueTable();
        store = new PostgresStore({ connectionString: POSTGRES_URL!, tableName: table });
        await store.initialize();
    });

    afterEach(async () => {
        await (store as any).pool?.query?.(`DROP TABLE IF EXISTS ${table}`);
        await store.close();
    });

    it('returns ArrayBuffer for non-JSON paths', async () => {
        await store.saveData('/tmp/x/blob.bin', Buffer.from([10, 20, 30, 40]));
        const result = await store.retrieveData('/tmp/x/blob.bin');
        expect(result instanceof ArrayBuffer).toBe(true);
        expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual([10, 20, 30, 40]);
    });

    it('accepts Uint8Array and ArrayBuffer inputs', async () => {
        const a = new Uint8Array([1, 2, 3]);
        await store.saveData('/tmp/x/u8.bin', a);
        await store.saveData('/tmp/x/ab.bin', a.buffer);
        expect(Array.from(new Uint8Array(await store.retrieveData('/tmp/x/u8.bin')))).toEqual([1, 2, 3]);
        expect(Array.from(new Uint8Array(await store.retrieveData('/tmp/x/ab.bin')))).toEqual([1, 2, 3]);
    });
});

maybe('PostgresStore — listings, deletion, enumeration', () => {
    let store: PostgresStore;
    let table: string;

    beforeEach(async () => {
        table = uniqueTable();
        store = new PostgresStore({ connectionString: POSTGRES_URL!, tableName: table });
        await store.initialize();
    });

    afterEach(async () => {
        await (store as any).pool?.query?.(`DROP TABLE IF EXISTS ${table}`);
        await store.close();
    });

    it('returns false when nothing matches', async () => {
        expect(await store.retrieveData('/tmp/x/missing.json')).toBe(false);
    });

    it('returns immediate child names for a "directory" path', async () => {
        await store.saveData('/tmp/d/a.json', '{}');
        await store.saveData('/tmp/d/b.json', '{}');
        await store.saveData('/tmp/d/sub/deep.json', '{}');
        expect(await store.retrieveData('/tmp/d')).toEqual(['a.json', 'b.json', 'sub']);
    });

    it('recursively deletes everything under a directory-style path', async () => {
        await store.saveData('/tmp/items/a.json', '{}');
        await store.saveData('/tmp/items/sub/b.json', '{}');
        await store.saveData('/tmp/items/sub/deeper/c.json', '{}');
        await store.saveData('/tmp/sibling.json', '{}'); // outside /tmp/items

        expect(await store.deleteData('/tmp/items')).toBe(true);
        expect(await store.retrieveData('/tmp/items/a.json')).toBe(false);
        expect(await store.retrieveData('/tmp/items/sub/b.json')).toBe(false);
        expect(await store.retrieveData('/tmp/sibling.json')).toEqual({});
    });

    it('listEntries yields exact + prefix matches', async () => {
        await store.saveData('/tmp/list/a.json', '{}');
        await store.saveData('/tmp/list/b.json', '{}');
        await store.saveData('/tmp/list/nested/c.json', '{}');

        const found: string[] = [];
        for await (const path of store.listEntries('/tmp/list')) found.push(path);

        expect(found.sort()).toEqual([
            '/tmp/list/a.json',
            '/tmp/list/b.json',
            '/tmp/list/nested/c.json',
        ]);
    });
});

maybe('PostgresStore — error handling', () => {
    it('rejects unsafe table names at construction time', () => {
        expect(() => new PostgresStore({
            connectionString: POSTGRES_URL!,
            tableName: 'bad; DROP TABLE users;',
        })).toThrow(/tableName/);
    });

    it('throws if used before initialize()', async () => {
        const store = new PostgresStore({ connectionString: POSTGRES_URL!, tableName: uniqueTable() });
        await expect(store.retrieveData('/x')).rejects.toThrow(/not initialized/);
    });
});

// Always-on test: the lazy pg loader produces a useful error if pg isn't
// installed. We can't actually uninstall pg in the test environment, but we
// can assert PostgresStore validates its own inputs without touching the DB.
describe('PostgresStore — input validation (driver-independent)', () => {
    it('requires a connectionString', () => {
        expect(() => new PostgresStore({ connectionString: '' })).toThrow(/connectionString/);
    });

    it('rejects table names with non-identifier characters', () => {
        expect(() => new PostgresStore({
            connectionString: 'postgres://x',
            tableName: 'has spaces',
        })).toThrow(/tableName/);
    });

    it('accepts safe identifier-style table names', () => {
        expect(() => new PostgresStore({
            connectionString: 'postgres://x',
            tableName: 'my_table_42',
        })).not.toThrow();
    });
});
