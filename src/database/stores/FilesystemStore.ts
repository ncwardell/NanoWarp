import fs from 'fs-extra';
import { readdir } from 'node:fs/promises';
import type { DataStore } from './DataStore';
import { setColor } from '../../helpers/colors';
import {
    writeFileRuntime,
    readJsonFile,
    readFileAsArrayBuffer,
} from '../../runtime/file';

/**
 * Default filesystem-backed implementation of DataStore.
 *
 * Behavior matches the original DataManager:
 *  - `.json` / `.lock` files are parsed as JSON on read
 *  - directories return their immediate child filenames
 *  - other files return raw bytes as ArrayBuffer
 *  - writes go through a temp-file + rename for atomicity
 *  - per-path mutex prevents concurrent writes from corrupting a file
 */
export class FilesystemStore implements DataStore {
    private writeLocks = new Map<string, Promise<boolean>>();

    async retrieveData(_path: string): Promise<any> {
        console.log(setColor(' • Retrieving Data', 'yellow'));
        if (!(await fs.pathExists(_path))) {
            console.log(setColor(` ➛ Retrieving Data Failed (${_path})`, 'red'));
            return false;
        }

        const stats = await fs.stat(_path);
        if (stats.isDirectory()) {
            console.log(setColor(` ➛ Returning Directory List (${_path})`, 'orange'));
            return await readdir(_path);
        } else if (_path.endsWith('.json') || _path.endsWith('.lock')) {
            console.log(setColor(` ➛ Returning JSON (${_path})`, 'orange'));
            return await readJsonFile(_path);
        } else {
            console.log(setColor(` ➛ Returning File (${_path})`, 'orange'));
            return await readFileAsArrayBuffer(_path);
        }
    }

    async saveData(_path: string, _data: any): Promise<boolean> {
        console.log(setColor(' • Saving Data', 'yellow'));

        // Wait for any existing write to this path to complete.
        while (this.writeLocks.has(_path)) {
            await this.writeLocks.get(_path);
        }

        // Atomic write: temp file then rename (POSIX guarantees atomicity).
        const tempPath = `${_path}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;

        const writePromise = (async () => {
            try {
                await writeFileRuntime(tempPath, _data);
                await fs.rename(tempPath, _path);
                console.log(setColor(` ➛ Data Saved (${_path})`, 'orange'));
                return true;
            } catch {
                try {
                    await fs.remove(tempPath);
                } catch {}
                console.log(setColor(` ➛ Data Save Failed (${_path})`, 'red'));
                return false;
            }
        })();

        this.writeLocks.set(_path, writePromise);
        try {
            return await writePromise;
        } finally {
            this.writeLocks.delete(_path);
        }
    }

    async deleteData(_path: string): Promise<boolean> {
        console.log(setColor(' • Deleting Data', 'yellow'));
        if (!(await fs.pathExists(_path))) {
            console.log(setColor(` ➛ Deleting Data Failed (${_path})`, 'red'));
            return false;
        }
        await fs.remove(_path);
        console.log(setColor(` ➛ Data Deleted (${_path})`, 'orange'));
        return true;
    }

    async *listEntries(prefix: string): AsyncIterable<string> {
        if (!(await fs.pathExists(prefix))) return;

        // Iterative DFS — avoids deep recursion on large trees.
        const stack: string[] = [prefix];
        while (stack.length > 0) {
            const dir = stack.pop()!;
            let entries;
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const entry of entries) {
                const full = `${dir}/${entry.name}`;
                if (entry.isDirectory()) {
                    stack.push(full);
                } else if (entry.isFile()) {
                    yield full;
                }
                // Symlinks deliberately skipped.
            }
        }
    }
}
