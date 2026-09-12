/**
 * Migrate user data between two DataStore implementations.
 *
 * Typical use:
 *   - filesystem → sqlite (consolidate scattered JSON files into one DB)
 *   - sqlite → filesystem (export back to inspectable, git-diffable files)
 *
 * Framework metadata (`database.lock`, the `Endpoints/` tree, the SQLite
 * file itself, and SQLite's WAL/journal sidecars) is skipped by default.
 * Endpoints/ MUST stay on the filesystem regardless of backend, since the
 * framework imports endpoint .ts files at runtime.
 */

import type { DataStore } from './stores/DataStore';

/** Substring patterns that, if matched anywhere in a path, cause it to be skipped. */
export const DEFAULT_SKIP_PATTERNS: readonly string[] = [
    '/database.lock',
    '/Endpoints/',
    '/data.db',          // also matches data.db-journal, data.db-wal, data.db-shm
];

export interface MigrateOptions {
    /** Source store (must implement listEntries). */
    from: DataStore;

    /** Target store. */
    to: DataStore;

    /** Path prefix to enumerate from. For NanoWarp this is the resolved dataPath. */
    prefix: string;

    /**
     * Substring patterns to skip. Defaults to DEFAULT_SKIP_PATTERNS.
     * Pass `[]` to migrate everything (including framework files — usually wrong).
     */
    skipPatterns?: readonly string[];

    /** Optional progress callback fired before each entry is processed. */
    onProgress?: (entry: { path: string; index: number }) => void;

    /** If true, enumerate and report what would be migrated but don't write anything. */
    dryRun?: boolean;
}

export interface MigrateResult {
    migrated: number;
    skipped: number;
    failed: number;
    errors: Array<{ path: string; error: string }>;
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
    if (!options.from.listEntries) {
        throw new Error(
            'Source store does not support enumeration (no listEntries method). ' +
            'Migration requires the source backend to be enumerable.'
        );
    }

    const skipPatterns = options.skipPatterns ?? DEFAULT_SKIP_PATTERNS;
    const result: MigrateResult = { migrated: 0, skipped: 0, failed: 0, errors: [] };

    let index = 0;
    for await (const path of options.from.listEntries(options.prefix)) {
        index++;

        if (skipPatterns.some(p => path.includes(p))) {
            result.skipped++;
            continue;
        }

        options.onProgress?.({ path, index });

        try {
            const data = await options.from.retrieveData(path);

            if (data === false) {
                // Source reported missing — shouldn't normally happen for a
                // path we just enumerated (race condition, perhaps), but be
                // defensive.
                result.skipped++;
                continue;
            }

            // listEntries yields only leaf paths, so `data` is always the
            // value at that path — never a directory listing. (A legitimate
            // JSON array stored at a leaf is valid user data and must be
            // migrated as-is.)
            const toSave = toSaveable(data);

            if (options.dryRun) {
                result.migrated++;
                continue;
            }

            const ok = await options.to.saveData(path, toSave);
            if (ok) {
                result.migrated++;
            } else {
                result.failed++;
                result.errors.push({ path, error: 'saveData returned false' });
            }
        } catch (err: any) {
            result.failed++;
            result.errors.push({ path, error: err?.message ?? String(err) });
        }
    }

    return result;
}

/**
 * Coerce a value returned by `retrieveData` back into something that
 * `saveData` will accept across both backends.
 *
 * - JSON objects/arrays → JSON.stringify (FilesystemStore writes string;
 *   SqliteStore stores UTF-8 bytes with kind='json')
 * - ArrayBuffer → Buffer (FilesystemStore needs string|Buffer|Uint8Array)
 * - string / Buffer / Uint8Array → passthrough
 */
function toSaveable(data: unknown): string | Buffer | Uint8Array {
    if (typeof data === 'string') return data;
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    // Plain object/array (parsed JSON) — re-stringify.
    return JSON.stringify(data);
}
