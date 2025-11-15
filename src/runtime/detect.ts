/**
 * Runtime Detection Utilities
 *
 * @module runtime/detect
 * @description Provides utilities for detecting the JavaScript runtime environment
 * (Bun, Node.js, or unknown). This enables cross-runtime compatibility by allowing
 * the framework to use runtime-specific APIs when available.
 */

/**
 * Supported JavaScript runtime types
 */
export type RuntimeType = 'bun' | 'node' | 'unknown';

/**
 * Check if running in Bun runtime
 *
 * Detects the presence of the global `Bun` object which is unique to Bun runtime.
 *
 * @constant
 * @example
 * ```typescript
 * if (isBun) {
 *   console.log('Running in Bun!');
 * }
 * ```
 */
export const isBun = typeof Bun !== 'undefined';

/**
 * Check if running in Node.js runtime
 *
 * Detects Node.js by checking for the `process` global and `process.versions.node`.
 * Note: This check explicitly excludes Bun, as Bun also provides a `process` global.
 *
 * @constant
 * @example
 * ```typescript
 * if (isNode) {
 *   console.log('Running in Node.js!');
 * }
 * ```
 */
export const isNode = !isBun && typeof process !== 'undefined' && process.versions?.node !== undefined;

/**
 * Get the current JavaScript runtime environment
 *
 * @returns The detected runtime type: 'bun', 'node', or 'unknown'
 *
 * @example
 * ```typescript
 * const runtime = getRuntime();
 * console.log(`Running on ${runtime}`);
 *
 * switch (runtime) {
 *   case 'bun':
 *     // Use Bun-specific features
 *     break;
 *   case 'node':
 *     // Use Node.js-specific features
 *     break;
 *   default:
 *     // Fallback for unknown runtime
 *     break;
 * }
 * ```
 */
export function getRuntime(): RuntimeType {
    if (isBun) return 'bun';
    if (isNode) return 'node';
    return 'unknown';
}
