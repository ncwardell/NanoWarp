import path from 'node:path';
import fs from 'fs-extra';
import type { DataStore } from './DataStore';
import { openSqlite, type SqliteHandle } from './sqlite-driver';
import { setColor } from '../../helpers/colors';

/**
 * SQLite-backed implementation of DataStore.
 *
 * Schema: a single `kv` table keyed by `path`. The `kind` column
 * discriminates between JSON values (stored as UTF-8 bytes) and binary
 * values (stored as raw bytes).
 *
 * Directory semantics are emulated via prefix range queries:
 * `retrieveData('/some/dir')` with no exact match returns the set of
 * immediate child names found under `/some/dir/...`.
 *
 * Atomicity: SQLite's INSERT OR REPLACE is single-statement atomic, so
 * the per-path mutex used by the filesystem store is unnecessary here.
 */
export class SqliteStore implements DataStore {
    private db: SqliteHandle | null = null;
    private readonly dbPath: string;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    async initialize(): Promise<void> {
        // Ensure the parent directory exists so SQLite can create the file.
        await fs.ensureDir(path.dirname(this.dbPath));

        this.db = await openSqlite(this.dbPath);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS kv (
                path       TEXT PRIMARY KEY,
                kind       TEXT NOT NULL CHECK(kind IN ('json', 'binary')),
                data       BLOB NOT NULL,
                updated_at INTEGER NOT NULL
            );
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
        `);
        console.log(setColor(` ➛ SQLite store ready (${this.dbPath})`, 'magenta'));
    }

    async close(): Promise<void> {
        this.db?.close();
        this.db = null;
    }

    async retrieveData(_path: string): Promise<any> {
        console.log(setColor(' • Retrieving Data', 'yellow'));
        const db = this.requireDb();

        // Exact match first.
        const row = db.prepare('SELECT kind, data FROM kv WHERE path = ?').get(_path) as
            | { kind: 'json' | 'binary'; data: Uint8Array | Buffer }
            | undefined;

        if (row) {
            const bytes = toBuffer(row.data);
            if (row.kind === 'json') {
                console.log(setColor(` ➛ Returning JSON (${_path})`, 'orange'));
                return JSON.parse(bytes.toString('utf-8'));
            }
            console.log(setColor(` ➛ Returning File (${_path})`, 'orange'));
            return toArrayBuffer(bytes);
        }

        // No exact match — try directory-style listing via prefix range.
        // `path > 'P/' AND path < 'P0'` selects everything starting with `P/`,
        // since '0' (0x30) is the next ASCII char after '/' (0x2F).
        const rows = db
            .prepare('SELECT path FROM kv WHERE path > ? AND path < ?')
            .all(_path + '/', _path + '0') as Array<{ path: string }>;

        if (rows.length === 0) {
            console.log(setColor(` ➛ Retrieving Data Failed (${_path})`, 'red'));
            return false;
        }

        const children = new Set<string>();
        for (const r of rows) {
            const rel = r.path.slice(_path.length + 1);
            const head = rel.split('/')[0];
            if (head) children.add(head);
        }
        console.log(setColor(` ➛ Returning Directory List (${_path})`, 'orange'));
        return Array.from(children).sort();
    }

    async saveData(_path: string, _data: any): Promise<boolean> {
        console.log(setColor(' • Saving Data', 'yellow'));
        const db = this.requireDb();

        const isJson = _path.endsWith('.json') || _path.endsWith('.lock');
        const kind = isJson ? 'json' : 'binary';
        const blob = toBlob(_data);
        if (!blob) {
            console.log(setColor(` ➛ Data Save Failed (unsupported data type) (${_path})`, 'red'));
            return false;
        }

        try {
            db.prepare(
                'INSERT OR REPLACE INTO kv (path, kind, data, updated_at) VALUES (?, ?, ?, ?)'
            ).run(_path, kind, blob, Date.now());
            console.log(setColor(` ➛ Data Saved (${_path})`, 'orange'));
            return true;
        } catch (err) {
            console.log(setColor(` ➛ Data Save Failed (${_path})`, 'red'));
            return false;
        }
    }

    async deleteData(_path: string): Promise<boolean> {
        console.log(setColor(' • Deleting Data', 'yellow'));
        const db = this.requireDb();

        // Delete the exact key plus everything underneath it (directory semantics).
        const result = db
            .prepare('DELETE FROM kv WHERE path = ? OR (path > ? AND path < ?)')
            .run(_path, _path + '/', _path + '0');

        if (result.changes > 0) {
            console.log(setColor(` ➛ Data Deleted (${_path})`, 'orange'));
            return true;
        }
        console.log(setColor(` ➛ Deleting Data Failed (${_path})`, 'red'));
        return false;
    }

    async *listEntries(prefix: string): AsyncIterable<string> {
        const db = this.requireDb();

        // Match the exact prefix and anything under it (path > P/' AND path < 'P0').
        const rows = db
            .prepare('SELECT path FROM kv WHERE path = ? OR (path > ? AND path < ?) ORDER BY path')
            .all(prefix, prefix + '/', prefix + '0') as Array<{ path: string }>;

        for (const row of rows) yield row.path;
    }

    private requireDb(): SqliteHandle {
        if (!this.db) {
            throw new Error('SqliteStore not initialized — call initialize() first');
        }
        return this.db;
    }
}

function toBuffer(value: Uint8Array | Buffer): Buffer {
    return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function toBlob(data: any): Uint8Array | null {
    if (typeof data === 'string') return Buffer.from(data, 'utf-8');
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return null;
}
