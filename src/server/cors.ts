/**
 * CORS support, implemented as middleware.
 *
 * Off by default. `corsMiddleware(config)` returns `{ before, after }` —
 * `before` handles OPTIONS preflight requests; `after` adds CORS response
 * headers to non-preflight responses.
 */

import type { CorsConfig, BeforeHandler, AfterHandler } from '../types/config';

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = ['Content-Type', 'X-API-Key'];
const DEFAULT_MAX_AGE = 600;

interface ResolvedCors {
    origin: (origin: string | null) => string | null;
    methods: string[];
    headers: string[];
    exposeHeaders: string[];
    credentials: boolean;
    maxAge: number;
}

function resolveConfig(config: CorsConfig): ResolvedCors | null {
    if (!config) return null;

    const cfg = config === true ? {} : config;

    let originResolver: (origin: string | null) => string | null;
    if (cfg.origin === undefined || cfg.origin === '*') {
        originResolver = () => '*';
    } else if (typeof cfg.origin === 'string') {
        const allowed = cfg.origin;
        originResolver = (o) => (o === allowed ? o : null);
    } else if (Array.isArray(cfg.origin)) {
        const set = new Set(cfg.origin);
        originResolver = (o) => (o && set.has(o) ? o : null);
    } else if (typeof cfg.origin === 'function') {
        const fn = cfg.origin;
        originResolver = (o) => (fn(o) ? (o ?? '*') : null);
    } else {
        originResolver = () => '*';
    }

    return {
        origin: originResolver,
        methods: cfg.methods ?? DEFAULT_METHODS,
        headers: cfg.headers ?? DEFAULT_HEADERS,
        exposeHeaders: cfg.exposeHeaders ?? [],
        credentials: cfg.credentials ?? false,
        maxAge: cfg.maxAge ?? DEFAULT_MAX_AGE,
    };
}

/**
 * Build CORS before+after middleware from a CorsConfig.
 *
 * Returns `null` if CORS is disabled (so the server can skip registration).
 */
export function corsMiddleware(config: CorsConfig): { before: BeforeHandler; after: AfterHandler } | null {
    const resolved = resolveConfig(config);
    if (!resolved) return null;

    const before: BeforeHandler = (request) => {
        // Only handle preflight (OPTIONS with Access-Control-Request-Method).
        if (request.method !== 'OPTIONS') return;
        if (!request.headers.get('Access-Control-Request-Method')) return;

        const origin = request.headers.get('Origin');
        const allowOrigin = resolved.origin(origin);
        if (!allowOrigin) {
            return new Response(null, { status: 403 });
        }

        const headers: Record<string, string> = {
            'Access-Control-Allow-Origin': allowOrigin,
            'Access-Control-Allow-Methods': resolved.methods.join(', '),
            'Access-Control-Allow-Headers': resolved.headers.join(', '),
            'Access-Control-Max-Age': String(resolved.maxAge),
        };
        if (resolved.credentials) {
            headers['Access-Control-Allow-Credentials'] = 'true';
        }
        if (allowOrigin !== '*') {
            headers['Vary'] = 'Origin';
        }

        return new Response(null, { status: 204, headers });
    };

    const after: AfterHandler = (request, response) => {
        const origin = request.headers.get('Origin');
        const allowOrigin = resolved.origin(origin);
        if (!allowOrigin) return; // not a CORS request — leave response alone

        // Mutate headers on the existing response.
        response.headers.set('Access-Control-Allow-Origin', allowOrigin);
        if (resolved.credentials) {
            response.headers.set('Access-Control-Allow-Credentials', 'true');
        }
        if (resolved.exposeHeaders.length > 0) {
            response.headers.set('Access-Control-Expose-Headers', resolved.exposeHeaders.join(', '));
        }
        if (allowOrigin !== '*') {
            response.headers.set('Vary', 'Origin');
        }
    };

    return { before, after };
}
