import type { DataStore } from './DataStore';
import { openPgPool, type PgPool } from './postgres-driver';
import { setColor } from '../../helpers/colors';

/**
 * Postgres-backed implementation of DataStore.
 *
 * Mirrors the SqliteStore: a single `kv` table keyed by path, with kind
 * discriminator ('json' | 'binary'). Identical semantics — endpoint code
 * is unchanged regardless of which backend is in use.
 *
 * Atomicity: `INSERT ... ON CONFLICT DO UPDATE` is single-statement atomic.
 *
 * Schema is created on `initialize()` if missing. The table name defaults
 * to `nanowarp_kv` and is configurable so multiple deployments can share
 * one Postgres database.
 */
export interface PostgresStoreOptions {
    /** Connection string, e.g. postgres://user:pass@host:5432/db */
    connectionString: string;
    /** Table to store key-value rows in. Default: 'nanowarp_kv'. */
    tableName?: string;
}

const SAFE_TABLE_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class PostgresStore implements DataStore {
    private pool: PgPool | null = null;
    private readonly connectionString: string;
    private readonly tableName: string;

    constructor(opts: PostgresStoreOptions) {
        if (!opts.connectionString) {
            throw new Error('PostgresStore: connectionString is required');
        }
        const tableName = opts.tableName ?? 'nanowarp_kv';
        if (!SAFE_TABLE_NAME.test(tableName)) {
            throw new Error(
                `PostgresStore: tableName must match /^[a-zA-Z_][a-zA-Z0-9_]*$/ (got ${JSON.stringify(tableName)}).`,
            );
        }
        this.connectionString = opts.connectionString;
        this.tableName = tableName;
    }

    async initialize(): Promise<void> {
        this.pool = await openPgPool(this.connectionString);
        await this.pool.query(`
            CREATE TABLE IF NOT EXISTS ${this.tableName} (
                path       TEXT PRIMARY KEY,
                kind       TEXT NOT NULL CHECK(kind IN ('json', 'binary')),
                data       BYTEA NOT NULL,
                updated_at BIGINT NOT NULL
            );
        `);
        console.log(setColor(` ➛ Postgres store ready (table=${this.tableName})`, 'magenta'));
    }

    async close(): Promise<void> {
        await this.pool?.end();
        this.pool = null;
    }

    async retrieveData(_path: string): Promise<any> {
        console.log(setColor(' • Retrieving Data', 'yellow'));
        const pool = this.requirePool();

        const exact = await pool.query(
            `SELECT kind, data FROM ${this.tableName} WHERE path = $1`,
            [_path],
        );
        if (exact.rows.length > 0) {
            const row = exact.rows[0];
            const bytes = toBuffer(row.data);
            if (row.kind === 'json') {
                console.log(setColor(` ➛ Returning JSON (${_path})`, 'orange'));
                return JSON.parse(bytes.toString('utf-8'));
            }
            console.log(setColor(` ➛ Returning File (${_path})`, 'orange'));
            return toArrayBuffer(bytes);
        }

        // Directory-style listing via prefix range (same trick as SqliteStore).
        const prefix = await pool.query(
            `SELECT path FROM ${this.tableName} WHERE path > $1 AND path < $2 ORDER BY path`,
            [_path + '/', _path + '0'],
        );
        if (prefix.rows.length === 0) {
            console.log(setColor(` ➛ Retrieving Data Failed (${_path})`, 'red'));
            return false;
        }

        const children = new Set<string>();
        for (const r of prefix.rows) {
            const rel = (r.path as string).slice(_path.length + 1);
            const head = rel.split('/')[0];
            if (head) children.add(head);
        }
        console.log(setColor(` ➛ Returning Directory List (${_path})`, 'orange'));
        return Array.from(children).sort();
    }

    async saveData(_path: string, _data: any): Promise<boolean> {
        console.log(setColor(' • Saving Data', 'yellow'));
        const pool = this.requirePool();

        const isJson = _path.endsWith('.json') || _path.endsWith('.lock');
        const kind = isJson ? 'json' : 'binary';
        const blob = toBlob(_data);
        if (!blob) {
            console.log(setColor(` ➛ Data Save Failed (unsupported data type) (${_path})`, 'red'));
            return false;
        }

        try {
            await pool.query(
                `INSERT INTO ${this.tableName} (path, kind, data, updated_at)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (path) DO UPDATE SET
                     kind = EXCLUDED.kind,
                     data = EXCLUDED.data,
                     updated_at = EXCLUDED.updated_at`,
                [_path, kind, Buffer.from(blob), Date.now()],
            );
            console.log(setColor(` ➛ Data Saved (${_path})`, 'orange'));
            return true;
        } catch (err) {
            console.log(setColor(` ➛ Data Save Failed (${_path})`, 'red'));
            return false;
        }
    }

    async deleteData(_path: string): Promise<boolean> {
        console.log(setColor(' • Deleting Data', 'yellow'));
        const pool = this.requirePool();

        const result = await pool.query(
            `DELETE FROM ${this.tableName} WHERE path = $1 OR (path > $2 AND path < $3)`,
            [_path, _path + '/', _path + '0'],
        );

        if (result.rowCount > 0) {
            console.log(setColor(` ➛ Data Deleted (${_path})`, 'orange'));
            return true;
        }
        console.log(setColor(` ➛ Deleting Data Failed (${_path})`, 'red'));
        return false;
    }

    async *listEntries(prefix: string): AsyncIterable<string> {
        const pool = this.requirePool();
        const result = await pool.query(
            `SELECT path FROM ${this.tableName} WHERE path = $1 OR (path > $2 AND path < $3) ORDER BY path`,
            [prefix, prefix + '/', prefix + '0'],
        );
        for (const row of result.rows) yield row.path as string;
    }

    private requirePool(): PgPool {
        if (!this.pool) {
            throw new Error('PostgresStore not initialized — call initialize() first');
        }
        return this.pool;
    }
}

function toBuffer(value: Buffer | Uint8Array | string): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (typeof value === 'string') return Buffer.from(value, 'utf-8');
    return Buffer.from(value);
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
