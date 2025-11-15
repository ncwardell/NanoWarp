// Runtime detection utility
export const isBun = typeof Bun !== 'undefined';
export const isNode = !isBun && typeof process !== 'undefined' && process.versions?.node !== undefined;

export function getRuntime(): 'bun' | 'node' | 'unknown' {
    if (isBun) return 'bun';
    if (isNode) return 'node';
    return 'unknown';
}
