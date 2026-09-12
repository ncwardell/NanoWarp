import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { NanoWarp, jwt, signHS256, getJwtPayload } from '../src/index';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const SECRET = 'test-secret-do-not-use-in-prod';
// 49500-range avoids colliding with server-features (48000–48599) and
// init-scaffold (49000-range) when the suite runs in parallel.
const port = 49500 + (process.pid % 100);
const baseUrl = `http://localhost:${port}`;

// Absolute path to the framework's jwt module — endpoints need this so they
// can `getJwtPayload(request)` regardless of where the temp dir lives.
const JWT_MODULE = path.resolve(__dirname, '../src/auth/jwt');

let server: NanoWarp;
let tmpDir: string;

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-jwt-'));

    await fs.ensureDir(`${tmpDir}/Endpoints/GET`);

    // Public endpoint — bypassed via `exclude`
    await fs.writeFile(`${tmpDir}/Endpoints/GET/health.ts`, `
        export const execute = async () => new Response('ok', { status: 200 });
    `);

    // Protected endpoint — needs valid JWT
    await fs.writeFile(`${tmpDir}/Endpoints/GET/me.ts`, `
        import { getJwtPayload } from '${JWT_MODULE}';
        export const execute = async (_p, request) => {
            const claims = getJwtPayload(request);
            return new Response(JSON.stringify(claims ?? null), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };
    `);

    server = new NanoWarp({
        port, dataPath: tmpDir, logging: false,
        middleware: {
            before: [jwt({ secret: SECRET, exclude: ['/health'] })],
        },
    });
    await server.start();
});

afterAll(async () => {
    await server.stop();
    await fs.remove(tmpDir);
});

describe('JWT auth middleware', () => {
    it('lets whitelisted (excluded) paths through without a token', async () => {
        const res = await fetch(`${baseUrl}/health`);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe('ok');
    });

    it('rejects requests without an Authorization header', async () => {
        const res = await fetch(`${baseUrl}/me`);
        expect(res.status).toBe(401);
        expect(res.headers.get('WWW-Authenticate')).toBe('Bearer');
    });

    it('rejects non-Bearer Authorization', async () => {
        const res = await fetch(`${baseUrl}/me`, { headers: { Authorization: 'Basic abc' } });
        expect(res.status).toBe(401);
    });

    it('rejects malformed tokens', async () => {
        const res = await fetch(`${baseUrl}/me`, { headers: { Authorization: 'Bearer not.a.jwt.too.many.parts' } });
        expect(res.status).toBe(401);
    });

    it('rejects tokens signed with a different secret', async () => {
        const wrongToken = await signHS256({ sub: 'alice' }, 'WRONG-SECRET');
        const res = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${wrongToken}` } });
        expect(res.status).toBe(401);
    });

    it('rejects tokens with alg: "none"', async () => {
        // Hand-craft a "none" alg token
        const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const payload = btoa(JSON.stringify({ sub: 'alice' }))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const noneToken = `${header}.${payload}.`;
        const res = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${noneToken}` } });
        expect(res.status).toBe(401);
    });

    it('rejects expired tokens', async () => {
        const expired = await signHS256(
            { sub: 'alice', exp: Math.floor(Date.now() / 1000) - 60 },
            SECRET,
        );
        const res = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${expired}` } });
        expect(res.status).toBe(401);
    });

    it('rejects tokens not-yet-valid (nbf in the future)', async () => {
        const tooEarly = await signHS256(
            { sub: 'alice', nbf: Math.floor(Date.now() / 1000) + 600 },
            SECRET,
        );
        const res = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${tooEarly}` } });
        expect(res.status).toBe(401);
    });

    it('accepts a valid token and attaches the payload to the request', async () => {
        const token = await signHS256(
            { sub: 'alice', role: 'admin', exp: Math.floor(Date.now() / 1000) + 600 },
            SECRET,
        );
        const res = await fetch(`${baseUrl}/me`, { headers: { Authorization: `Bearer ${token}` } });
        expect(res.status).toBe(200);
        const payload = await res.json();
        expect(payload.sub).toBe('alice');
        expect(payload.role).toBe('admin');
    });
});

describe('JWT scoped to specific path prefixes', () => {
    let scopedServer: NanoWarp;
    let scopedDir: string;
    const scopedPort = port + 1;
    const scopedUrl = `http://localhost:${scopedPort}`;

    beforeAll(async () => {
        scopedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-jwt-scoped-'));
        await fs.ensureDir(`${scopedDir}/Endpoints/GET/admin`);
        await fs.writeFile(`${scopedDir}/Endpoints/GET/public.ts`, `
            export const execute = async () => new Response('public', { status: 200 });
        `);
        await fs.writeFile(`${scopedDir}/Endpoints/GET/admin/dashboard.ts`, `
            export const execute = async () => new Response('admin-only', { status: 200 });
        `);

        scopedServer = new NanoWarp({
            port: scopedPort, dataPath: scopedDir, logging: false,
            middleware: { before: [jwt({ secret: SECRET, paths: ['/admin'] })] },
        });
        await scopedServer.start();
    });

    afterAll(async () => {
        await scopedServer.stop();
        await fs.remove(scopedDir);
    });

    it('allows unauthenticated access outside the protected prefix', async () => {
        const res = await fetch(`${scopedUrl}/public`);
        expect(res.status).toBe(200);
    });

    it('requires auth inside the protected prefix', async () => {
        const res = await fetch(`${scopedUrl}/admin/dashboard`);
        expect(res.status).toBe(401);
    });

    it('allows authenticated access to the protected prefix', async () => {
        const token = await signHS256({ sub: 'bob' }, SECRET);
        const res = await fetch(`${scopedUrl}/admin/dashboard`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
    });
});
