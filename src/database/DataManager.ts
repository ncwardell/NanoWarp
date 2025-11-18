//Imports
import fs from 'fs-extra';
import { readdir } from "node:fs/promises";
import { setColor } from '../helpers/colors';
import { DirectoryList } from './DirectoryList';
import type { DirectoryEntry } from './DirectoryList';
import { replacer, reviver } from '../helpers/mappingString';
import { writeFileRuntime, readJsonFile, readFileAsArrayBuffer, fileExists } from '../runtime/file';

//Used To Manage The Storage of the DataManager
class ManagedStorage {
    RootDirectory: string
    DataBaseFile: string
    Initialize: Function
    DirectoryList: DirectoryList

    constructor(_rootDirectory: string, _dbFile: string, _directoryList: DirectoryList) {
        this.RootDirectory = _rootDirectory;
        this.DataBaseFile = _dbFile;
        this.DirectoryList = _directoryList;
        this.Initialize = async () => {
            //Ensure Root Directory & Config File Exist
            if ((await fs.pathExists(this.RootDirectory)) == false) { await fs.ensureDir(this.RootDirectory); }
            if ((await fs.pathExists(this.DataBaseFile)) == false) { await writeFileRuntime(this.DataBaseFile, JSON.stringify({})); }
            //Ensure Paths For Server Endpoints
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints'); }
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints/GET')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints/GET'); }
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints/POST')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints/POST'); }
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints/PUT')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints/PUT'); }
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints/PATCH')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints/PATCH'); }
            if ((await fs.pathExists(this.RootDirectory + '/Endpoints/DELETE')) == false) { await fs.ensureDir(this.RootDirectory + '/Endpoints/DELETE'); }
        }
    }
}


//Create DataManager
export class DataManager {

    //Total Database Storage
    DataTree: ManagedStorage;

    //File write locks for atomic operations
    private writeLocks = new Map<string, Promise<boolean>>();

    //Background scan status
    private isBackgroundScanning: boolean = false;
    private backgroundScanProgress: { current: number; total: number } = { current: 0, total: 0 };

    //Constructs The Object
    constructor(_rootFolder: string, _directoryEntry?: DirectoryEntry) {
        if (_directoryEntry === undefined) {
            this.DataTree = new ManagedStorage(_rootFolder, _rootFolder + '/database.lock', new DirectoryList(_rootFolder));
        } else {
            this.DataTree = new ManagedStorage(_rootFolder, _rootFolder + '/database.lock', new DirectoryList(_rootFolder, _directoryEntry));
        }
    };

    /**
     * Generate a blank OpenAPI schema template
     * Useful for defining endpoint schemas
     *
     * @param type - Schema type (object, array, string, number, boolean)
     * @param properties - Object properties (for object type)
     * @param items - Array item schema (for array type)
     * @returns OpenAPI schema object
     */
    static createSchema(
        type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'integer',
        options?: {
            properties?: Record<string, any>;
            required?: string[];
            items?: any;
            description?: string;
            example?: any;
        }
    ): any {
        const schema: any = { type };

        if (options?.description) {
            schema.description = options.description;
        }

        if (type === 'object' && options?.properties) {
            schema.properties = options.properties;
            if (options.required) {
                schema.required = options.required;
            }
        }

        if (type === 'array' && options?.items) {
            schema.items = options.items;
        }

        if (options?.example) {
            schema.example = options.example;
        }

        return schema;
    }

    //Initialize Storage
    async initialize(options?: { lazy?: boolean; backgroundScan?: boolean }) {
        //Makes Sure Root Directory and database.lock File Exists
        await this.DataTree.Initialize();
        //Loads & Reads The Database File
        let databaseFile = await readJsonFile(this.DataTree.DataBaseFile);
        //If Database File is Not Empty
        if (JSON.stringify(databaseFile) !== '{}') {
            await this.loadDataBase(this.DataTree.DataBaseFile);
        } else {
            //If lazy loading, only scan root level
            if (options?.lazy) {
                this.DataTree.DirectoryList.EntryList = await this.DataTree.DirectoryList.buildDirectoryMap(this.DataTree.RootDirectory, true);
                await this.saveDataBase();
            } else {
                //Full scan
                await this.scanDatabase();
            }
        }
        console.log(setColor('| Database Initialized |', 'magenta') + '\n');

        //Start background scan if requested
        if (options?.backgroundScan && options?.lazy) {
            console.log(setColor('| Starting background scan... |', 'cyan'));
            this.startBackgroundScan();
        }
    };

    async retrieveData(_path: string) {
        console.log(setColor(' • Retrieving Data', 'yellow'));
        if (await fs.pathExists(_path) == true) {
            const stats = await fs.stat(_path);
            if (stats.isDirectory()) {
                console.log(setColor(` ➛ Returning Directory List (${_path})`, 'orange'));
                return await readdir(_path);
            } else if ((_path.endsWith('.json')) || (_path.endsWith('.lock'))) {
                console.log(setColor(` ➛ Returning JSON (${_path})`, 'orange'));
                return await readJsonFile(_path);
            } else {
                console.log(setColor(` ➛ Returning File (${_path})`, 'orange'));
                return await readFileAsArrayBuffer(_path);
            }
        } else {
            console.log(setColor(` ➛ Retrieving Data Failed (${_path})`, 'red'));
            return false;
        }
    };

    async deleteData(_path: string) {
        console.log(setColor(' • Deleting Data', 'yellow'));
        if (await fs.pathExists(_path) == true) {
            await fs.remove(_path);
            console.log(setColor(` ➛ Data Deleted (${_path})`, 'orange'));
            return true;
        } else {
            console.log(setColor(` ➛ Deleting Data Failed (${_path})`, 'red'));
            return false;
        }
    }

    async saveData(_path: string, _data: any) {
        console.log(setColor(' • Saving Data', 'yellow'));

        // Wait for any existing write to this file to complete
        while (this.writeLocks.has(_path)) {
            await this.writeLocks.get(_path);
        }

        // Atomic write using temp file then rename
        const tempPath = `${_path}.tmp.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`;

        const writePromise = (async () => {
            try {
                // Write to temporary file
                await writeFileRuntime(tempPath, _data);

                // Atomic rename (POSIX guarantees atomicity)
                await fs.rename(tempPath, _path);

                console.log(setColor(` ➛ Data Saved (${_path})`, 'orange'));
                return true;
            } catch (error) {
                // Clean up temp file if it exists
                try {
                    await fs.remove(tempPath);
                } catch {}

                console.log(setColor(` ➛ Data Save Failed (${_path})`, 'red'));
                return false;
            }
        })();

        // Lock this path
        this.writeLocks.set(_path, writePromise);

        try {
            return await writePromise;
        } finally {
            this.writeLocks.delete(_path);
        }
    };


    async loadDataBase(_path: string) {
        if (await fileExists(_path)) {
            try {
                // Read raw file content and parse once with reviver (no double parse)
                const rawContent = await fs.readFile(_path, 'utf-8');
                const reconstructed = JSON.parse(rawContent, reviver);
                this.DataTree = new ManagedStorage(reconstructed.RootDirectory, reconstructed.DataBaseFile, new DirectoryList(reconstructed.RootDirectory, reconstructed.DirectoryList.EntryList));
                console.log(setColor(` ➛ Database Loaded (${_path})`, 'magenta'));
            } catch (error) {
                console.log(setColor('| Database Load Failed |', 'red') + '\n');
            }
        } else {
            console.log(setColor(` ➛ Database Load Failed (${_path})`, 'red'));
        }
    }

    async saveDataBase() {
        await this.saveData(this.DataTree.DataBaseFile, JSON.stringify(this.DataTree, replacer));
    }

    async scanDatabase(){
        this.DataTree.DirectoryList.EntryList = await this.DataTree.DirectoryList.buildDirectoryMap(this.DataTree.RootDirectory);
        await this.saveDataBase();
    }

    /**
     * Refresh a specific path in the directory tree (partial scan)
     *
     * This is much faster than scanDatabase() for updating specific directories.
     * Scans only the specified path and updates both in-memory tree and database.lock
     *
     * @param relativePath - Path relative to root (e.g., "ClientData" or "ClientData/client123")
     * @returns The refreshed DirectoryEntry, or null if path doesn't exist
     *
     * @example
     * ```typescript
     * // Refresh only the ClientData directory
     * await dataManager.refreshPath("ClientData");
     *
     * // Refresh a specific client
     * await dataManager.refreshPath("ClientData/client123");
     * ```
     */
    async refreshPath(relativePath: string): Promise<DirectoryEntry | null> {
        try {
            // Convert relative path to absolute
            const absolutePath = relativePath.startsWith(this.DataTree.RootDirectory)
                ? relativePath
                : `${this.DataTree.RootDirectory}/${relativePath}`;

            // Verify path exists
            if (!(await fs.pathExists(absolutePath))) {
                console.log(setColor(` ➛ Refresh failed: Path does not exist (${absolutePath})`, 'red'));
                return null;
            }

            // Scan the subtree
            console.log(setColor(` • Refreshing path: ${relativePath}`, 'yellow'));
            const freshEntry = await this.DataTree.DirectoryList.buildDirectoryMap(absolutePath);

            // Navigate to the parent in the tree and update
            const pathParts = relativePath.split('/').filter(Boolean);

            if (pathParts.length === 0) {
                // Refreshing root
                this.DataTree.DirectoryList.EntryList = freshEntry;
            } else {
                // Navigate to parent
                let current = this.DataTree.DirectoryList.EntryList;

                for (let i = 0; i < pathParts.length - 1; i++) {
                    if (!current.Descendants) {
                        console.log(setColor(` ➛ Refresh failed: Parent directory not found in tree`, 'red'));
                        return null;
                    }
                    const next = current.Descendants.get(pathParts[i]);
                    if (!next) {
                        console.log(setColor(` ➛ Refresh failed: Path segment "${pathParts[i]}" not found`, 'red'));
                        return null;
                    }
                    current = next;
                }

                // Update the entry in parent's Descendants
                if (current.Descendants) {
                    const targetName = pathParts[pathParts.length - 1];
                    current.Descendants.set(targetName, freshEntry);
                } else {
                    console.log(setColor(` ➛ Refresh failed: Parent is not a directory`, 'red'));
                    return null;
                }
            }

            // Save updated tree to database.lock
            await this.saveDataBase();
            console.log(setColor(` ➛ Path refreshed and saved (${relativePath})`, 'green'));

            return freshEntry;
        } catch (error) {
            console.log(setColor(` ➛ Refresh failed: ${error}`, 'red'));
            return null;
        }
    }

    /**
     * Start a background scan to fully populate the directory tree
     *
     * This runs asynchronously without blocking. Useful for lazy-loaded databases
     * that need to be fully populated over time.
     *
     * The scan progressively loads all directories and saves incrementally.
     */
    private startBackgroundScan(): void {
        if (this.isBackgroundScanning) {
            console.log(setColor(' ⚠ Background scan already in progress', 'yellow'));
            return;
        }

        this.isBackgroundScanning = true;

        // Run in background (don't await)
        this.performBackgroundScan().catch(error => {
            console.log(setColor(` ✗ Background scan failed: ${error}`, 'red'));
        }).finally(() => {
            this.isBackgroundScanning = false;
        });
    }

    /**
     * Perform the actual background scanning work
     * @private
     */
    private async performBackgroundScan(): Promise<void> {
        try {
            // Recursively expand all lazy-loaded directories
            await this.expandDirectoryRecursive(this.DataTree.DirectoryList.EntryList);

            // Save the fully expanded tree
            await this.saveDataBase();
            console.log(setColor(' ✓ Background scan complete', 'green'));
        } catch (error) {
            console.log(setColor(` ✗ Background scan error: ${error}`, 'red'));
            throw error;
        }
    }

    /**
     * Recursively expand all lazy-loaded directories
     * @private
     */
    private async expandDirectoryRecursive(entry: DirectoryEntry): Promise<void> {
        if (entry.Type === 'directory' && entry.Descendants) {
            // If this directory is lazy-loaded (empty), load its children
            if (entry.Descendants.size === 0) {
                await this.DataTree.DirectoryList.loadDescendants(entry);
                console.log(setColor(` ⟳ Background loaded: ${entry.Path}`, 'cyan'));
            }

            // Recursively expand all child directories
            for (const [_, childEntry] of entry.Descendants.entries()) {
                await this.expandDirectoryRecursive(childEntry);
            }
        }
    }

    /**
     * Check if a background scan is currently running
     * @returns true if background scan is in progress
     */
    isScanning(): boolean {
        return this.isBackgroundScanning;
    }

    /**
     * Get background scan progress
     * @returns Object with current and total progress counts
     */
    getScanProgress(): { current: number; total: number; isScanning: boolean } {
        return {
            ...this.backgroundScanProgress,
            isScanning: this.isBackgroundScanning
        };
    }

}

