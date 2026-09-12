/**
 * Thin adapter over runtime-provided SQLite drivers.
 *
 *  - On Bun: uses the built-in `bun:sqlite`.
 *  - On Node: uses `node:sqlite` (stable since Node 22.5). Earlier Node will
 *    fail at import time with a clear error message.
 *
 * Both drivers expose nearly identical synchronous APIs; this module
 * normalizes them to a single `SqliteHandle` shape.
 */

import { isBun } from '../../runtime/detect';

export interface SqliteStatement {
    run(...args: any[]): { changes: number; lastInsertRowid?: number | bigint };
    get(...args: any[]): any;
    all(...args: any[]): any[];
}

export interface SqliteHandle {
    exec(sql: string): void;
    prepare(sql: string): SqliteStatement;
    close(): void;
}

export async function openSqlite(dbPath: string): Promise<SqliteHandle> {
    if (isBun) {
        // @ts-ignore — bun:sqlite is provided by the Bun runtime
        const { Database } = await import('bun:sqlite');
        const db = new Database(dbPath);
        return {
            exec: (sql) => db.exec(sql),
            prepare: (sql) => db.prepare(sql) as unknown as SqliteStatement,
            close: () => db.close(),
        };
    }

    try {
        // @ts-ignore — node:sqlite is provided by Node 22.5+
        const mod = await import('node:sqlite');
        const DatabaseSync = (mod as any).DatabaseSync;
        const db = new DatabaseSync(dbPath);
        return {
            exec: (sql) => db.exec(sql),
            prepare: (sql) => db.prepare(sql) as unknown as SqliteStatement,
            close: () => db.close(),
        };
    } catch (err: any) {
        throw new Error(
            `SQLite backend requires Bun, or Node 22.5+ with node:sqlite available. ` +
            `Original error: ${err?.message ?? err}`
        );
    }
}
