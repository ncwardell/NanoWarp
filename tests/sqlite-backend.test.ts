/**
 * Integration test: same endpoint code, SQLite backend.
 *
 * The endpoint files written below are deliberately the same shape as the
 * filesystem-backed tests in tests/http-integration.test.ts — the only
 * difference is `database: { backend: 'sqlite' }` in the server config.
 * That proves the drop-in property: switching backends requires zero
 * changes to user code.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { NanoWarp } from '../src/index';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const PORT = 47900 + (process.pid % 100);
const baseUrl = `http://localhost:${PORT}`;

let server: NanoWarp;
let tmpDir: string;

const CRUD_GET = `
export const execute = async (_path, _req, Database) => {
    const filePath = Database.DataTree.RootDirectory + '/items.json';
    const data = await Database.retrieveData(filePath);
    return new Response(JSON.stringify(Array.isArray(data) ? data : []), {
        status: 200, headers: { 'Content-Type': 'application/json' }
    });
};
`;

const CRUD_POST = `
export const execute = async (_path, req, Database) => {
    const body = await req.json();
    if (!body?.name) return new Response('{"error":"name required"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
    const filePath = Database.DataTree.RootDirectory + '/items.json';
    const existing = await Database.retrieveData(filePath);
    const items = Array.isArray(existing) ? existing : [];
    const item = { id: Date.now() + Math.floor(Math.random() * 100000), name: body.name };
    items.push(item);
    await Database.saveData(filePath, JSON.stringify(items));
    return new Response(JSON.stringify(item), { status: 201, headers: { 'Content-Type': 'application/json' } });
};
`;

const CRUD_PUT = `
export const execute = async (_path, req, Database) => {
    const body = await req.json();
    if (typeof body?.id !== 'number' || typeof body?.name !== 'string') {
        return new Response('{"error":"id and name required"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const filePath = Database.DataTree.RootDirectory + '/items.json';
    const items = (await Database.retrieveData(filePath)) || [];
    const idx = items.findIndex(i => i.id === body.id);
    if (idx === -1) return new Response('{"error":"not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    items[idx] = { id: body.id, name: body.name };
    await Database.saveData(filePath, JSON.stringify(items));
    return new Response(JSON.stringify(items[idx]), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
`;

const CRUD_PATCH = `
export const execute = async (_path, req, Database) => {
    const body = await req.json();
    if (typeof body?.id !== 'number') {
        return new Response('{"error":"id required"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const filePath = Database.DataTree.RootDirectory + '/items.json';
    const items = (await Database.retrieveData(filePath)) || [];
    const idx = items.findIndex(i => i.id === body.id);
    if (idx === -1) return new Response('{"error":"not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    items[idx] = { ...items[idx], ...body, id: items[idx].id };
    await Database.saveData(filePath, JSON.stringify(items));
    return new Response(JSON.stringify(items[idx]), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
`;

const CRUD_DELETE = `
export const execute = async (_path, req, Database) => {
    const body = await req.json();
    if (typeof body?.id !== 'number') {
        return new Response('{"error":"id required"}', { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const filePath = Database.DataTree.RootDirectory + '/items.json';
    const items = (await Database.retrieveData(filePath)) || [];
    const idx = items.findIndex(i => i.id === body.id);
    if (idx === -1) return new Response('{"error":"not found"}', { status: 404, headers: { 'Content-Type': 'application/json' } });
    const [removed] = items.splice(idx, 1);
    await Database.saveData(filePath, JSON.stringify(items));
    return new Response(JSON.stringify(removed), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
`;

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-sqlite-it-'));

    const files: Array<[string, string]> = [
        ['Endpoints/GET/items.ts', CRUD_GET],
        ['Endpoints/POST/items.ts', CRUD_POST],
        ['Endpoints/PUT/items.ts', CRUD_PUT],
        ['Endpoints/PATCH/items.ts', CRUD_PATCH],
        ['Endpoints/DELETE/items.ts', CRUD_DELETE],
    ];
    for (const [relPath, contents] of files) {
        const fullPath = `${tmpDir}/${relPath}`;
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, contents);
    }

    server = new NanoWarp({
        port: PORT,
        dataPath: tmpDir,
        logging: false,
        openapi: { enabled: false },
        // The only difference from the filesystem-backed test
        database: { backend: 'sqlite' },
    });
    await server.start();
});

afterAll(async () => {
    await server.stop();
    await fs.remove(tmpDir);
});

describe('SQLite backend — full CRUD lifecycle (no user code changes)', () => {
    let createdId: number;

    it('starts with an empty list', async () => {
        const res = await fetch(`${baseUrl}/items`);
        expect(res.status).toBe(200);
        const items = await res.json();
        expect(items).toEqual([]);
    });

    it('POST creates an item (201)', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'sqlite-1' }),
        });
        expect(res.status).toBe(201);
        const item = await res.json();
        expect(item.name).toBe('sqlite-1');
        createdId = item.id;
    });

    it('GET reflects the new item', async () => {
        const res = await fetch(`${baseUrl}/items`);
        const items = await res.json();
        expect(items.find((i: any) => i.id === createdId)?.name).toBe('sqlite-1');
    });

    it('PUT replaces the item', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: createdId, name: 'sqlite-replaced' }),
        });
        expect(res.status).toBe(200);
        const item = await res.json();
        expect(item.name).toBe('sqlite-replaced');
    });

    it('PATCH merges an extra field', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: createdId, extra: 'tag' }),
        });
        expect(res.status).toBe(200);
        const item = await res.json();
        expect(item.name).toBe('sqlite-replaced');
        expect(item.extra).toBe('tag');
    });

    it('DELETE removes the item', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: createdId }),
        });
        expect(res.status).toBe(200);
    });

    it('GET shows the deletion', async () => {
        const res = await fetch(`${baseUrl}/items`);
        const items = await res.json();
        expect(items.find((i: any) => i.id === createdId)).toBeUndefined();
    });

    it('persists to a SQLite file under the data dir', async () => {
        // Default sqlite.path is ${dataPath}/data.db
        const dbFile = path.join(tmpDir, 'data.db');
        expect(await fs.pathExists(dbFile)).toBe(true);
        const stat = await fs.stat(dbFile);
        expect(stat.size).toBeGreaterThan(0);
    });
});
