/**
 * DataStore interface — backend-agnostic key/value store for endpoint data.
 *
 * The three data ops (`retrieveData`, `saveData`, `deleteData`) form the
 * contract that endpoints rely on. Implementations may be backed by the
 * filesystem (default) or by a database such as SQLite.
 */

export interface DataStore {
    /**
     * Optional backend setup. Called once during DataManager.initialize().
     */
    initialize?(): Promise<void>;

    /**
     * Read data at a path.
     *
     * Behavior matches the historical filesystem-backed contract:
     *  - `.json` and `.lock` paths return the parsed JSON value
     *  - directory-style paths return an array of immediate child names
     *  - any other path returns the raw bytes as an ArrayBuffer
     *  - missing paths return `false`
     */
    retrieveData(path: string): Promise<any>;

    /**
     * Write data at a path. Returns `true` on success.
     *
     * `data` is whatever the endpoint passed in. In practice that's a string
     * (JSON.stringify output) or binary (Buffer/Uint8Array/ArrayBuffer).
     */
    saveData(path: string, data: any): Promise<boolean>;

    /**
     * Delete the entry at a path. For directory-style paths, removes
     * everything under the prefix. Returns `true` if anything was removed.
     */
    deleteData(path: string): Promise<boolean>;

    /**
     * Optional teardown. Called during graceful shutdown.
     */
    close?(): Promise<void>;

    /**
     * Optional enumeration. Yields every leaf path (i.e. every actual data
     * value, not directories) under the given prefix. Used by the migration
     * tool. Implementations should yield in any order.
     *
     * Stores that don't implement this can't be used as a migration source.
     */
    listEntries?(prefix: string): AsyncIterable<string>;
}
