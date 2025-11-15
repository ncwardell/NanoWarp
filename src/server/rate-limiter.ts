/**
 * Endpoint-level rate limiting utility
 * Uses token bucket algorithm for rate limiting
 */

import type { EndpointRateLimitConfig } from '../types/config';
import { setColor } from '../helpers/colors';

// Global rate limiter state (shared across all endpoints)
const rateLimiter = new Map<string, { tokens: number; lastRefill: number }>();

// Default rate limiting config (disabled by default if not specified)
const DEFAULT_RATE_LIMIT: Required<EndpointRateLimitConfig> = {
    maxTokens: 100,
    refillRate: 10,
    refillInterval: 1000,
    enabled: false,
};

/**
 * Check if a request should be rate limited
 * @param ip - Client IP address
 * @param path - Endpoint path
 * @param config - Endpoint rate limit configuration
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
    ip: string,
    path: string,
    config?: EndpointRateLimitConfig
): boolean {
    // Merge with defaults
    const rateLimitConfig = {
        maxTokens: config?.maxTokens ?? DEFAULT_RATE_LIMIT.maxTokens,
        refillRate: config?.refillRate ?? DEFAULT_RATE_LIMIT.refillRate,
        refillInterval: config?.refillInterval ?? DEFAULT_RATE_LIMIT.refillInterval,
        enabled: config?.enabled ?? DEFAULT_RATE_LIMIT.enabled,
    };

    // Check if rate limiting is disabled
    if (!rateLimitConfig.enabled) {
        return true;
    }

    // Use IP:path as bucket key for per-endpoint rate limiting
    const bucketKey = `${ip}:${path}`;

    const now = Date.now();
    let bucket = rateLimiter.get(bucketKey);

    if (!bucket) {
        // Create new bucket with full tokens
        bucket = { tokens: rateLimitConfig.maxTokens - 1, lastRefill: now };
        rateLimiter.set(bucketKey, bucket);
        return true;
    }

    // Calculate tokens to add based on time elapsed
    const timeElapsed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timeElapsed / rateLimitConfig.refillInterval) * rateLimitConfig.refillRate;

    if (tokensToAdd > 0) {
        bucket.tokens = Math.min(rateLimitConfig.maxTokens, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
    }

    // Check if we have tokens available
    if (bucket.tokens > 0) {
        bucket.tokens--;
        return true;
    }

    return false;
}

/**
 * Clean up old rate limiter entries (prevent memory leak)
 * Should be called periodically
 */
export function cleanupRateLimiter() {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, bucket] of rateLimiter.entries()) {
        if (now - bucket.lastRefill > maxAge) {
            rateLimiter.delete(key);
        }
    }
}

// Periodic cleanup every 5 minutes
setInterval(cleanupRateLimiter, 5 * 60 * 1000);
