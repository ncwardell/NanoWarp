import { describe, it, expect } from 'bun:test';
import { checkRateLimit } from '../src/server/rate-limiter';

// The rate-limiter uses a process-wide Map keyed by `ip:path`. Tests use unique
// IPs (random suffix) to avoid bucket collisions across tests.
const uniqIp = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2)}`;

describe('rate-limiter', () => {
    it('allows everything when config is undefined', () => {
        const ip = uniqIp('a');
        for (let i = 0; i < 1000; i++) {
            expect(checkRateLimit(ip, '/x')).toBe(true);
        }
    });

    it('allows everything when explicitly disabled', () => {
        const ip = uniqIp('b');
        const cfg = { enabled: false, maxTokens: 1, refillRate: 0, refillInterval: 1000 };
        for (let i = 0; i < 1000; i++) {
            expect(checkRateLimit(ip, '/x', cfg)).toBe(true);
        }
    });

    it('rejects requests after tokens exhausted', () => {
        const ip = uniqIp('c');
        const cfg = { enabled: true, maxTokens: 3, refillRate: 0, refillInterval: 100000 };
        expect(checkRateLimit(ip, '/p', cfg)).toBe(true);
        expect(checkRateLimit(ip, '/p', cfg)).toBe(true);
        expect(checkRateLimit(ip, '/p', cfg)).toBe(true);
        expect(checkRateLimit(ip, '/p', cfg)).toBe(false);
    });

    it('uses separate buckets per (ip, path)', () => {
        const ip = uniqIp('d');
        const cfg = { enabled: true, maxTokens: 1, refillRate: 0, refillInterval: 100000 };
        expect(checkRateLimit(ip, '/p1', cfg)).toBe(true);
        expect(checkRateLimit(ip, '/p1', cfg)).toBe(false);
        // Different path, fresh bucket
        expect(checkRateLimit(ip, '/p2', cfg)).toBe(true);
    });

    it('uses separate buckets per IP for the same path', () => {
        const ipA = uniqIp('eA');
        const ipB = uniqIp('eB');
        const cfg = { enabled: true, maxTokens: 1, refillRate: 0, refillInterval: 100000 };
        expect(checkRateLimit(ipA, '/shared', cfg)).toBe(true);
        expect(checkRateLimit(ipA, '/shared', cfg)).toBe(false);
        expect(checkRateLimit(ipB, '/shared', cfg)).toBe(true);
    });

    it('refills tokens over time', async () => {
        const ip = uniqIp('f');
        // 2 tokens, refill 1 per 50ms.
        const cfg = { enabled: true, maxTokens: 2, refillRate: 1, refillInterval: 50 };
        expect(checkRateLimit(ip, '/r', cfg)).toBe(true);
        expect(checkRateLimit(ip, '/r', cfg)).toBe(true);
        expect(checkRateLimit(ip, '/r', cfg)).toBe(false);

        // Wait long enough for at least one refill interval.
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(checkRateLimit(ip, '/r', cfg)).toBe(true);
    });
});
