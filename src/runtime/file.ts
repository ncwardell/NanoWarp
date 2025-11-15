/**
 * Cross-Runtime File Operations
 *
 * @module runtime/file
 * @description Provides a unified file I/O API that works seamlessly across
 * both Bun and Node.js runtimes. Automatically detects the runtime and uses
 * the appropriate native APIs for optimal performance.
 *
 * Features:
 * - Unified API for file reading/writing
 * - Automatic runtime detection
 * - Zero-copy operations where possible
 * - Type-safe interfaces
 */

import { isBun } from './detect';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Supported file data types for write operations
 */
export type FileData = string | Buffer | Uint8Array;

/**
 * Write data to a file using runtime-specific optimizations
 *
 * - **Bun**: Uses `Bun.write()` for optimized write performance
 * - **Node.js**: Uses `fs.promises.writeFile()`
 *
 * @param path - Absolute or relative path to the file
 * @param data - Data to write (string, Buffer, or Uint8Array)
 * @returns Promise that resolves when the file is written
 *
 * @example
 * ```typescript
 * // Write a text file
 * await writeFileRuntime('./output.txt', 'Hello World');
 *
 * // Write binary data
 * const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
 * await writeFileRuntime('./output.bin', buffer);
 * ```
 */
export async function writeFileRuntime(path: string, data: FileData): Promise<void> {
    if (isBun) {
        // @ts-expect-error - Bun global not in standard TypeScript types
        await Bun.write(path, data);
    } else {
        await writeFile(path, data);
    }
}

/**
 * Read and parse a JSON file
 *
 * - **Bun**: Uses `Bun.file().json()` for native JSON parsing
 * - **Node.js**: Reads file and parses with `JSON.parse()`
 *
 * @param path - Absolute or relative path to the JSON file
 * @returns Promise resolving to the parsed JSON data
 * @throws {SyntaxError} If the file contains invalid JSON
 *
 * @example
 * ```typescript
 * interface Config {
 *   port: number;
 *   host: string;
 * }
 *
 * const config = await readJsonFile<Config>('./config.json');
 * console.log(`Server port: ${config.port}`);
 * ```
 */
export async function readJsonFile<T = unknown>(path: string): Promise<T> {
    if (isBun) {
        // @ts-expect-error - Bun global not in standard TypeScript types
        return await Bun.file(path).json();
    } else {
        const content = await readFile(path, 'utf-8');
        return JSON.parse(content) as T;
    }
}

/**
 * Read a file as an ArrayBuffer
 *
 * Useful for reading binary files or when you need direct access to raw bytes.
 *
 * - **Bun**: Uses `Bun.file().arrayBuffer()` for zero-copy reads
 * - **Node.js**: Reads as Buffer and converts to ArrayBuffer
 *
 * @param path - Absolute or relative path to the file
 * @returns Promise resolving to the file contents as ArrayBuffer
 *
 * @example
 * ```typescript
 * // Read an image file
 * const imageData = await readFileAsArrayBuffer('./image.png');
 * const uint8View = new Uint8Array(imageData);
 * console.log(`File size: ${imageData.byteLength} bytes`);
 * ```
 */
export async function readFileAsArrayBuffer(path: string): Promise<ArrayBuffer> {
    if (isBun) {
        // @ts-expect-error - Bun global not in standard TypeScript types
        return await Bun.file(path).arrayBuffer();
    } else {
        const buffer = await readFile(path);
        // Convert Node.js Buffer to ArrayBuffer (zero-copy slice)
        return buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
        ) as ArrayBuffer;
    }
}

/**
 * Check if a file exists at the given path
 *
 * - **Bun**: Uses `Bun.file().exists()` for fast existence check
 * - **Node.js**: Attempts to read the file and catches errors
 *
 * @param path - Absolute or relative path to check
 * @returns Promise resolving to `true` if file exists, `false` otherwise
 *
 * @example
 * ```typescript
 * if (await fileExists('./config.json')) {
 *   console.log('Config file found');
 * } else {
 *   console.log('Config file not found, using defaults');
 * }
 * ```
 */
export async function fileExists(path: string): Promise<boolean> {
    if (isBun) {
        // @ts-expect-error - Bun global not in standard TypeScript types
        return await Bun.file(path).exists();
    } else {
        try {
            await readFile(path);
            return true;
        } catch {
            return false;
        }
    }
}
