import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { NanoWarp } from '../src/index';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

// Pick a high port that's unlikely to collide with anything else on the box.
// Add a small per-process offset so concurrent runs don't fight over the same port.
const PORT = 47800 + (process.pid % 100);
const baseUrl = `http://localhost:${PORT}`;

let server: NanoWarp;
let tmpDir: string;

const ROUTING_ENDPOINT = (method: string) => `
export const execute = async (_path, request) => {
    let body = null;
    if (request.method !== 'GET' && request.method !== 'DELETE') {
        try { body = await request.json(); } catch {}
    }
    return new Response(JSON.stringify({ method: '${method}', body }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
};
`;

// CRUD endpoint reused for /items across all five methods. Method dispatch
// happens at the framework level (different files in different method dirs);
// each file performs the same persistence pattern.
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
    const item = { id: Date.now() + Math.floor(Math.random() * 1000), name: body.name };
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
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-http-'));

    const files: Array<[string, string]> = [
        ['Endpoints/GET/route-test.ts', ROUTING_ENDPOINT('GET')],
        ['Endpoints/POST/route-test.ts', ROUTING_ENDPOINT('POST')],
        ['Endpoints/PUT/route-test.ts', ROUTING_ENDPOINT('PUT')],
        ['Endpoints/PATCH/route-test.ts', ROUTING_ENDPOINT('PATCH')],
        ['Endpoints/DELETE/route-test.ts', ROUTING_ENDPOINT('DELETE')],

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
    });
    await server.start();
});

afterAll(async () => {
    await server.stop();
    await fs.remove(tmpDir);
});

describe('HTTP method routing', () => {
    const cases: Array<[string, boolean]> = [
        ['GET', false],
        ['POST', true],
        ['PUT', true],
        ['PATCH', true],
        ['DELETE', false], // DELETE typically has no body in our routing test
    ];

    for (const [method, sendBody] of cases) {
        it(`routes ${method} requests to Endpoints/${method}/`, async () => {
            const init: RequestInit = { method };
            if (sendBody) {
                init.headers = { 'Content-Type': 'application/json' };
                init.body = JSON.stringify({ ping: method });
            }
            const res = await fetch(`${baseUrl}/route-test`, init);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.method).toBe(method);
            if (sendBody) {
                expect(body.body).toEqual({ ping: method });
            }
        });
    }
});

describe('Server-level error responses', () => {
    it('returns 405 with Allow header for unsupported methods (OPTIONS)', async () => {
        const res = await fetch(`${baseUrl}/route-test`, { method: 'OPTIONS' });
        expect(res.status).toBe(405);
        const allow = res.headers.get('Allow') ?? '';
        expect(allow).toContain('GET');
        expect(allow).toContain('POST');
        expect(allow).toContain('PUT');
        expect(allow).toContain('PATCH');
        expect(allow).toContain('DELETE');
    });

    it('returns 400 for an empty path ("/")', async () => {
        const res = await fetch(`${baseUrl}/`);
        expect(res.status).toBe(400);
    });

    it('returns 404 for a missing GET endpoint file', async () => {
        const res = await fetch(`${baseUrl}/this-endpoint-does-not-exist`);
        expect(res.status).toBe(404);
    });

    it('returns 404 for a missing PUT endpoint file', async () => {
        const res = await fetch(`${baseUrl}/missing-put`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
        expect(res.status).toBe(404);
    });

    it('strips a leading /api segment before routing', async () => {
        // Server treats /api/route-test the same as /route-test
        const res = await fetch(`${baseUrl}/api/route-test`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.method).toBe('GET');
    });
});

describe('CRUD lifecycle covering POST/GET/PUT/PATCH/DELETE', () => {
    let createdId: number;

    it('POST /items creates an item (201)', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Initial' }),
        });
        expect(res.status).toBe(201);
        const item = await res.json();
        expect(item.name).toBe('Initial');
        expect(typeof item.id).toBe('number');
        createdId = item.id;
    });

    it('GET /items returns the created item', async () => {
        const res = await fetch(`${baseUrl}/items`);
        expect(res.status).toBe(200);
        const items = await res.json();
        expect(items.find((i: any) => i.id === createdId)?.name).toBe('Initial');
    });

    it('PUT /items replaces the item (200)', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: createdId, name: 'Replaced' }),
        });
        expect(res.status).toBe(200);
        const item = await res.json();
        expect(item.name).toBe('Replaced');
    });

    it('PATCH /items merges a partial update', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: createdId, extra: 'added-by-patch' }),
        });
        expect(res.status).toBe(200);
        const item = await res.json();
        expect(item.name).toBe('Replaced'); // preserved from PUT
        expect(item.extra).toBe('added-by-patch');
    });

    it('PUT returns 404 for unknown id', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 999999999, name: 'Ghost' }),
        });
        expect(res.status).toBe(404);
    });

    it('PATCH returns 400 when id is missing', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'no id here' }),
        });
        expect(res.status).toBe(400);
    });

    it('DELETE /items removes the item (200)', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: createdId }),
        });
        expect(res.status).toBe(200);
    });

    it('GET /items no longer contains the deleted id', async () => {
        const res = await fetch(`${baseUrl}/items`);
        const items = await res.json();
        expect(items.find((i: any) => i.id === createdId)).toBeUndefined();
    });

    it('DELETE returns 404 for an already-deleted id', async () => {
        const res = await fetch(`${baseUrl}/items`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: createdId }),
        });
        expect(res.status).toBe(404);
    });
});
