/**
 * Lazy adapter over the `pg` (node-postgres) driver.
 *
 * Not a hard dependency of nanowarp — users opt into Postgres by installing
 * `pg` themselves (`bun add pg`). If the SQL backend is configured but
 * `pg` is not installed, initialize() throws with a clear error.
 */

export interface PgQueryResult {
    rows: any[];
    rowCount: number;
}

export interface PgPool {
    query(sql: string, params?: unknown[]): Promise<PgQueryResult>;
    end(): Promise<void>;
}

export async function openPgPool(connectionString: string): Promise<PgPool> {
    let pgModule: any;
    try {
        pgModule = await import('pg');
    } catch (err: any) {
        throw new Error(
            'Postgres backend requires the `pg` package. Install it with ' +
            '`bun add pg` (or `npm install pg`) and try again. ' +
            `Original error: ${err?.message ?? err}`,
        );
    }
    const Pool = pgModule.Pool ?? pgModule.default?.Pool;
    if (!Pool) throw new Error('pg module did not export Pool');

    const pool = new Pool({ connectionString });
    return {
        query: async (sql, params) => {
            const res = await pool.query(sql, params);
            return { rows: res.rows ?? [], rowCount: res.rowCount ?? 0 };
        },
        end: async () => {
            await pool.end();
        },
    };
}
