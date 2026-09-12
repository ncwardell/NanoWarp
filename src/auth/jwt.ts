/**
 * JWT validation middleware (HS256 only).
 *
 * Recipe for the most common consulting auth pattern: validate a Bearer
 * token signed with a shared secret, attach the decoded payload to the
 * request, expose it via `getJwtPayload(request)` from inside endpoints.
 *
 * Implemented with Web Crypto — no third-party JWT dependency. Only HS256
 * is supported. The `none` algorithm is rejected unconditionally. For
 * RS256 / ES256 / JWE / JWKS rotation, drop in `jose` directly.
 */

import type { BeforeHandler } from '../types/config';

export interface JwtOptions {
    /** HMAC shared secret used to verify the signature. */
    secret: string;

    /**
     * Path prefixes that require auth. If omitted, all paths require auth.
     * Match is `request.pathname.startsWith(prefix)`.
     */
    paths?: string[];

    /**
     * Path prefixes that bypass auth even if `paths` matches. Useful for
     * /health, /metrics, /openapi.json, etc.
     */
    exclude?: string[];

    /**
     * Clock skew tolerance in seconds. Default: 0.
     * If set, tokens are valid up to this many seconds past `exp`.
     */
    clockSkew?: number;
}

/**
 * Per-request payload store. Keyed by Request so it's automatically
 * cleared by GC when the request goes out of scope.
 */
const payloadStore = new WeakMap<Request, JwtPayload>();

export interface JwtPayload {
    [claim: string]: unknown;
    sub?: string;
    iat?: number;
    exp?: number;
    nbf?: number;
}

/**
 * Returns the decoded JWT payload for the current request, or `null` if
 * the request was not authenticated (whitelisted path, or auth disabled).
 */
export function getJwtPayload(request: Request): JwtPayload | null {
    return payloadStore.get(request) ?? null;
}

/**
 * Build a JWT validation `before`-middleware.
 *
 * Returns 401 for missing, malformed, expired, or invalid tokens.
 * On success, attaches the decoded payload (accessible via
 * `getJwtPayload(request)` from inside endpoints).
 */
export function jwt(opts: JwtOptions): BeforeHandler {
    if (!opts.secret) {
        throw new Error('jwt(): secret is required');
    }

    const matches = (path: string, prefixes: string[]): boolean =>
        prefixes.some(p => path === p || path.startsWith(p.endsWith('/') ? p : p + '/'));

    return async (request) => {
        const url = new URL(request.url);
        const path = url.pathname;

        if (opts.exclude && matches(path, opts.exclude)) return;
        if (opts.paths && !matches(path, opts.paths)) return;

        const auth = request.headers.get('Authorization');
        if (!auth || !auth.startsWith('Bearer ')) {
            return unauthorized('Missing Bearer token');
        }

        const token = auth.slice('Bearer '.length).trim();
        try {
            const payload = await verifyHS256(token, opts.secret, opts.clockSkew ?? 0);
            payloadStore.set(request, payload);
        } catch (err: any) {
            return unauthorized(err?.message ?? 'Invalid token');
        }
    };
}

function unauthorized(reason: string): Response {
    return new Response(`Unauthorized: ${reason}`, {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer' },
    });
}

// ─────────────────────────────────────────────────────────────────────────
// HS256 verification using Web Crypto.
// ─────────────────────────────────────────────────────────────────────────

async function verifyHS256(token: string, secret: string, clockSkew: number): Promise<JwtPayload> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');

    const [headerB64, payloadB64, sigB64] = parts;

    let header: { alg?: string; typ?: string };
    try {
        header = JSON.parse(b64uDecodeString(headerB64));
    } catch {
        throw new Error('Malformed header');
    }

    if (header.alg !== 'HS256') {
        // Reject 'none' explicitly and any other algorithm we don't support.
        throw new Error('Unsupported algorithm');
    }

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
    );

    const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = b64uDecodeBytes(sigB64);

    const valid = await crypto.subtle.verify('HMAC', key, signature, signedData);
    if (!valid) throw new Error('Signature verification failed');

    let payload: JwtPayload;
    try {
        payload = JSON.parse(b64uDecodeString(payloadB64));
    } catch {
        throw new Error('Malformed payload');
    }

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && now > payload.exp + clockSkew) {
        throw new Error('Token expired');
    }
    if (typeof payload.nbf === 'number' && now + clockSkew < payload.nbf) {
        throw new Error('Token not yet valid');
    }

    return payload;
}

// base64url helpers (RFC 7515 Appendix C)

function b64uDecodeString(input: string): string {
    return new TextDecoder().decode(b64uDecodeBytes(input));
}

function b64uDecodeBytes(input: string): Uint8Array {
    const padded = input.replace(/-/g, '+').replace(/_/g, '/');
    const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const decoded = atob(padded + padding);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i);
    return bytes;
}

/**
 * Helper for tests / scripts: sign an HS256 token. Not exported by default
 * since most consulting auth flows have an upstream IDP minting tokens.
 *
 * @internal — exported for tests; stable but minimal.
 */
export async function signHS256(payload: JwtPayload, secret: string): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const headerB64 = b64uEncode(JSON.stringify(header));
    const payloadB64 = b64uEncode(JSON.stringify(payload));
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, data);
    const sigB64 = b64uEncodeBytes(new Uint8Array(sig));
    return `${headerB64}.${payloadB64}.${sigB64}`;
}

function b64uEncode(input: string): string {
    return b64uEncodeBytes(new TextEncoder().encode(input));
}

function b64uEncodeBytes(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
