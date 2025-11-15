/**
 * Directory Tree Management
 *
 * @module database/DirectoryList
 * @description Provides a hierarchical representation of filesystem directories
 * with support for lazy loading, caching, and efficient path lookups.
 */

import fs from 'fs-extra';

/**
 * Type of directory entry
 */
export type EntryType = 'file' | 'directory' | 'temp';

/**
 * Represents a single filesystem entry (file or directory)
 *
 * This interface forms a tree structure where directories can have
 * descendants (child entries).
 */
export interface DirectoryEntry {
    /**
     * Type of entry: file, directory, or temp (used internally for buffering)
     */
    Type: EntryType;

    /**
     * Absolute path to the entry
     */
    Path: string;

    /**
     * Child entries (only present for directories)
     * Map key is the filename, value is the DirectoryEntry
     */
    Descendants?: Map<string, DirectoryEntry>;
}

/**
 * Manages a hierarchical directory structure with caching and lazy loading
 *
 * Features:
 * - Tree-based directory representation
 * - Lazy loading support for large directory structures
 * - Entry lookup caching
 * - Recursive path creation
 */
export class DirectoryList {
    /**
     * Root directory entry containing the entire tree
     */
    public EntryList: DirectoryEntry;

    /**
     * Cache for getEntry() results to avoid redundant tree traversals
     * @private
     */
    private EntryBuffer: Record<string, DirectoryEntry[]> = {};

    /**
     * Create a new DirectoryList instance
     *
     * @param rootDirectory - Path to the root directory
     * @param directoryEntry - Optional pre-built directory entry (for deserialization)
     *
     * @example
     * ```typescript
     * // Create from scratch
     * const dirList = new DirectoryList('./my-data');
     *
     * // Create from existing entry (e.g., loaded from database)
     * const dirList = new DirectoryList('./my-data', savedEntry);
     * ```
     */
    constructor(rootDirectory: string, directoryEntry?: DirectoryEntry) {
        if (directoryEntry === undefined) {
            this.EntryList = { Type: 'directory', Path: rootDirectory };
        } else {
            this.EntryList = directoryEntry;
        }
    }

    /**
     * Clear the entry lookup cache
     *
     * Call this after modifying the directory structure to ensure
     * getEntry() returns up-to-date results.
     *
     * @returns Promise that resolves when cache is cleared
     */
    async clearEntryBuffer(): Promise<void> {
        this.EntryBuffer = {};
    }

    /**
     * Recursively ensure all paths in the directory tree exist
     *
     * Creates directories and files as needed based on the tree structure.
     * This is useful for initializing a directory structure from a template.
     *
     * @param directoryEntry - Starting point for path creation (defaults to root)
     * @returns Promise that resolves when all paths are created
     *
     * @example
     * ```typescript
     * await dirList.ensurePaths();
     * // All directories and files in the tree now exist on disk
     * ```
     */
    async ensurePaths(directoryEntry: DirectoryEntry = this.EntryList): Promise<void> {
        if (directoryEntry.Type === 'directory') {
            // Ensure directory exists
            if (!(await fs.pathExists(directoryEntry.Path))) {
                await fs.ensureDir(directoryEntry.Path);
            }

            // Recursively ensure descendants exist
            if (directoryEntry.Descendants !== undefined) {
                for (const [_key, value] of directoryEntry.Descendants.entries()) {
                    await this.ensurePaths(value);
                }
            }
        } else if (directoryEntry.Type === 'file') {
            // Ensure file exists
            if (!(await fs.pathExists(directoryEntry.Path))) {
                await fs.ensureFile(directoryEntry.Path);
            }
        }
    }

    /**
     * Search the directory tree for entries matching a filename
     *
     * Performs a depth-first search of the tree and caches results.
     * Returns all entries with the specified filename (not full path).
     *
     * @param target - Filename to search for (not full path)
     * @param entry - Starting point for search (defaults to root)
     * @returns Promise that resolves when search is complete (results in EntryBuffer)
     *
     * @example
     * ```typescript
     * await dirList.getEntry('config.json');
     * const matches = dirList.EntryBuffer['config.json'];
     * console.log(`Found ${matches.length} matches`);
     * ```
     */
    async getEntry(target: string, entry: DirectoryEntry = this.EntryList): Promise<void> {
        // Initialize buffer with temp entry if not exists
        if (this.EntryBuffer[target] === undefined) {
            this.EntryBuffer[target] = [{ Type: 'temp', Path: '' }];
        }

        // Search descendants for matching key
        if (entry.Descendants !== undefined) {
            for (const [key, value] of entry.Descendants.entries()) {
                if (key === target) {
                    this.EntryBuffer[target].push(value);
                } else {
                    // Recursively search child entries
                    await this.getEntry(target, value);
                }
            }
        }

        // Remove temp entry marker
        if (this.EntryBuffer[target][0]?.Type === 'temp') {
            this.EntryBuffer[target].splice(0, 1);
        }
    }

    /**
     * Build a directory tree by recursively scanning the filesystem
     *
     * @param path - Root path to start scanning from
     * @param lazy - If true, don't scan subdirectories (use loadDescendants later)
     * @returns Promise resolving to the directory entry tree
     *
     * @example
     * ```typescript
     * // Eager loading (scan everything)
     * const tree = await dirList.buildDirectoryMap('./data');
     *
     * // Lazy loading (scan on-demand)
     * const tree = await dirList.buildDirectoryMap('./data', true);
     * ```
     */
    async buildDirectoryMap(path: string, lazy: boolean = false): Promise<DirectoryEntry> {
        // Get filesystem stats
        const stats = await fs.stat(path);

        // Create entry for this path
        const entry: DirectoryEntry = {
            Type: stats.isFile() ? 'file' : 'directory',
            Path: path,
        };

        // If directory, scan children (unless lazy loading)
        if (entry.Type === 'directory') {
            entry.Descendants = new Map();

            if (!lazy) {
                const files = await fs.readdir(path);
                for (const file of files) {
                    const filePath = `${entry.Path}/${file}`;
                    entry.Descendants.set(file, await this.buildDirectoryMap(filePath, lazy));
                }
            }
        }

        return entry;
    }

    /**
     * Load descendants for a directory entry on-demand (lazy loading)
     *
     * Used when the tree was built with lazy=true. Scans the directory
     * and populates its immediate children (not recursive).
     *
     * @param entry - Directory entry to load descendants for
     * @returns Promise that resolves when descendants are loaded
     *
     * @example
     * ```typescript
     * const tree = await dirList.buildDirectoryMap('./data', true);
     * // Later, when you need the children...
     * await dirList.loadDescendants(tree);
     * ```
     */
    async loadDescendants(entry: DirectoryEntry): Promise<void> {
        // Only load if it's a directory with an empty descendants map
        if (entry.Type === 'directory' && entry.Descendants && entry.Descendants.size === 0) {
            try {
                const files = await fs.readdir(entry.Path);
                for (const file of files) {
                    const filePath = `${entry.Path}/${file}`;
                    const stats = await fs.stat(filePath);

                    const childEntry: DirectoryEntry = {
                        Type: stats.isFile() ? 'file' : 'directory',
                        Path: filePath,
                    };

                    // Add empty descendants map for lazy-loaded directories
                    if (childEntry.Type === 'directory') {
                        childEntry.Descendants = new Map();
                    }

                    entry.Descendants.set(file, childEntry);
                }
            } catch (error) {
                console.error(`Error loading descendants for ${entry.Path}:`, error);
            }
        }
    }
}

