/**
 * Integration tests for the new server-level features:
 *  - CORS (preflight + response-header injection)
 *  - Middleware hooks (before short-circuit, after mutation)
 *  - /metrics endpoint
 *  - 404 vs 500 split for endpoint errors
 *  - Body size limit
 *
 * One server is booted per describe block via beforeAll; afterAll tears it down.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { NanoWarp } from '../src/index';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const portBase = 48000;
let nextPortOffset = 0;
const allocPort = () => portBase + (process.pid % 100) + (nextPortOffset++ * 100);

const writeEndpoint = async (root: string, method: string, name: string, body: string): Promise<void> => {
    const dir = `${root}/Endpoints/${method}`;
    await fs.ensureDir(dir);
    await fs.writeFile(`${dir}/${name}.ts`, body);
};

// ─────────────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────────────
describe('CORS', () => {
    let server: NanoWarp;
    let tmpDir: string;
    let port: number;
    let baseUrl: string;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-cors-'));
        await writeEndpoint(tmpDir, 'GET', 'thing', `
            export const execute = async () => new Response(JSON.stringify({ ok: true }), {
                status: 200, headers: { 'Content-Type': 'application/json' }
            });
        `);
        port = allocPort();
        baseUrl = `http://localhost:${port}`;
        server = new NanoWarp({
            port, dataPath: tmpDir, logging: false,
            cors: { origin: ['https://app.example.com', 'https://other.example.com'] },
        });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await fs.remove(tmpDir);
    });

    it('handles OPTIONS preflight with the requested method/headers', async () => {
        const res = await fetch(`${baseUrl}/thing`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://app.example.com',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'X-API-Key',
            },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
        expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
        expect(res.headers.get('Vary')).toBe('Origin');
    });

    it('rejects preflight from disallowed origin with 403', async () => {
        const res = await fetch(`${baseUrl}/thing`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://evil.example.com',
                'Access-Control-Request-Method': 'GET',
            },
        });
        expect(res.status).toBe(403);
    });

    it('adds Access-Control-Allow-Origin to actual responses', async () => {
        const res = await fetch(`${baseUrl}/thing`, {
            headers: { 'Origin': 'https://app.example.com' },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });

    it('does not add CORS headers when origin is not allowed', async () => {
        const res = await fetch(`${baseUrl}/thing`, {
            headers: { 'Origin': 'https://evil.example.com' },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

describe('CORS off by default', () => {
    let server: NanoWarp;
    let tmpDir: string;
    let port: number;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-nocors-'));
        await writeEndpoint(tmpDir, 'GET', 'thing', `
            export const execute = async () => new Response('ok', { status: 200 });
        `);
        port = allocPort();
        server = new NanoWarp({ port, dataPath: tmpDir, logging: false });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await fs.remove(tmpDir);
    });

    it('does not respond to OPTIONS preflight when CORS is unset', async () => {
        const res = await fetch(`http://localhost:${port}/thing`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'https://anything.com',
                'Access-Control-Request-Method': 'GET',
            },
        });
        // Server returns 405 (Method Not Allowed) since OPTIONS isn't routed.
        expect(res.status).toBe(405);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('does not add CORS headers to GET responses', async () => {
        const res = await fetch(`http://localhost:${port}/thing`, {
            headers: { 'Origin': 'https://anything.com' },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────
// Middleware hooks
// ─────────────────────────────────────────────────────────────────────
describe('Middleware hooks', () => {
    let server: NanoWarp;
    let tmpDir: string;
    let port: number;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-mw-'));
        await writeEndpoint(tmpDir, 'GET', 'thing', `
            export const execute = async () => new Response('inner', { status: 200 });
        `);
        port = allocPort();

        server = new NanoWarp({
            port, dataPath: tmpDir, logging: false,
            middleware: {
                before: [
                    (request) => {
                        if (request.headers.get('X-Block') === 'yes') {
                            return new Response('blocked by middleware', { status: 451 });
                        }
                    },
                ],
                after: [
                    (_request, response) => {
                        response.headers.set('X-Powered-By', 'NanoWarp-test');
                    },
                ],
            },
        });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await fs.remove(tmpDir);
    });

    it('before-middleware can short-circuit a request', async () => {
        const res = await fetch(`http://localhost:${port}/thing`, {
            headers: { 'X-Block': 'yes' },
        });
        expect(res.status).toBe(451);
        expect(await res.text()).toBe('blocked by middleware');
    });

    it('after-middleware mutates response headers on the way out', async () => {
        const res = await fetch(`http://localhost:${port}/thing`);
        expect(res.status).toBe(200);
        expect(res.headers.get('X-Powered-By')).toBe('NanoWarp-test');
        expect(await res.text()).toBe('inner');
    });
});

// ─────────────────────────────────────────────────────────────────────
// /metrics endpoint
// ─────────────────────────────────────────────────────────────────────
describe('/metrics endpoint', () => {
    let server: NanoWarp;
    let tmpDir: string;
    let port: number;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-metrics-'));
        await writeEndpoint(tmpDir, 'GET', 'ok', `
            export const execute = async () => new Response('ok', { status: 200 });
        `);
        await writeEndpoint(tmpDir, 'POST', 'echo', `
            export const execute = async (_p, req) => new Response(await req.text(), { status: 200 });
        `);
        port = allocPort();
        server = new NanoWarp({
            port, dataPath: tmpDir, logging: false,
            metrics: { enabled: true },
        });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await fs.remove(tmpDir);
    });

    it('reports counters by status and method', async () => {
        await fetch(`http://localhost:${port}/ok`);
        await fetch(`http://localhost:${port}/ok`);
        await fetch(`http://localhost:${port}/missing`); // 404
        await fetch(`http://localhost:${port}/echo`, { method: 'POST', body: 'hi' });

        const res = await fetch(`http://localhost:${port}/metrics`);
        expect(res.status).toBe(200);
        const m = await res.json();

        expect(m.requests_total).toBeGreaterThanOrEqual(4);
        expect(m.requests_by_method.GET).toBeGreaterThanOrEqual(2);
        expect(m.requests_by_method.POST).toBeGreaterThanOrEqual(1);
        expect(m.requests_by_status['200']).toBeGreaterThanOrEqual(3);
        expect(m.requests_by_status['404']).toBeGreaterThanOrEqual(1);
        expect(m.uptime_seconds).toBeGreaterThanOrEqual(0);
    });
});

describe('/metrics is not exposed when disabled', () => {
    let server: NanoWarp;
    let tmpDir: string;
    let port: number;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-nometrics-'));
        port = allocPort();
        server = new NanoWarp({ port, dataPath: tmpDir, logging: false });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await fs.remove(tmpDir);
    });

    it('returns 404 for /metrics when not enabled', async () => {
        const res = await fetch(`http://localhost:${port}/metrics`);
        expect(res.status).toBe(404);
    });
});

// ─────────────────────────────────────────────────────────────────────
// 404 vs 500 split
// ─────────────────────────────────────────────────────────────────────
describe('Status codes for missing route vs runtime error', () => {
    let server: NanoWarp;
    let tmpDir: string;
    let port: number;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-status-'));
        await writeEndpoint(tmpDir, 'GET', 'works', `
            export const execute = async () => new Response('ok', { status: 200 });
        `);
        await writeEndpoint(tmpDir, 'GET', 'throws', `
            export const execute = async () => { throw new Error('user-code-blew-up'); };
        `);
        port = allocPort();
        server = new NanoWarp({ port, dataPath: tmpDir, logging: false });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await fs.remove(tmpDir);
    });

    it('returns 404 for a missing endpoint file', async () => {
        const res = await fetch(`http://localhost:${port}/does-not-exist`);
        expect(res.status).toBe(404);
    });

    it('returns 500 when the endpoint code throws at runtime', async () => {
        const res = await fetch(`http://localhost:${port}/throws`);
        expect(res.status).toBe(500);
    });

    it('returns 200 for a healthy endpoint', async () => {
        const res = await fetch(`http://localhost:${port}/works`);
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────────────────────────────
// Body size limit
// ─────────────────────────────────────────────────────────────────────
describe('Body size limit', () => {
    let server: NanoWarp;
    let tmpDir: string;
    let port: number;

    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-bodylimit-'));
        await writeEndpoint(tmpDir, 'POST', 'sink', `
            export const execute = async (_p, req) => {
                const body = await req.text();
                return new Response(String(body.length), { status: 200 });
            };
        `);
        port = allocPort();
        server = new NanoWarp({
            port, dataPath: tmpDir, logging: false,
            bodyLimit: { maxBytes: 100 }, // 100 bytes
        });
        await server.start();
    });

    afterAll(async () => {
        await server.stop();
        await fs.remove(tmpDir);
    });

    it('accepts bodies under the limit', async () => {
        const small = 'a'.repeat(50);
        const res = await fetch(`http://localhost:${port}/sink`, {
            method: 'POST',
            body: small,
        });
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('50');
    });

    it('rejects bodies over the limit with 413', async () => {
        const big = 'a'.repeat(500);
        const res = await fetch(`http://localhost:${port}/sink`, {
            method: 'POST',
            body: big,
        });
        expect(res.status).toBe(413);
    });
});
