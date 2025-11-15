// File operations abstraction layer
import { isBun } from './detect';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Write data to a file (works in both Bun and Node.js)
 */
export async function writeFileRuntime(path: string, data: string | Buffer | Uint8Array): Promise<void> {
    if (isBun) {
        // @ts-ignore - Bun global
        await Bun.write(path, data);
    } else {
        await writeFile(path, data);
    }
}

/**
 * Read a JSON file (works in both Bun and Node.js)
 */
export async function readJsonFile(path: string): Promise<any> {
    if (isBun) {
        // @ts-ignore - Bun global
        return await Bun.file(path).json();
    } else {
        const content = await readFile(path, 'utf-8');
        return JSON.parse(content);
    }
}

/**
 * Read a file as ArrayBuffer (works in both Bun and Node.js)
 */
export async function readFileAsArrayBuffer(path: string): Promise<ArrayBuffer> {
    if (isBun) {
        // @ts-ignore - Bun global
        return await Bun.file(path).arrayBuffer();
    } else {
        const buffer = await readFile(path);
        // Convert Node Buffer to ArrayBuffer
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    }
}

/**
 * Check if a file exists (works in both Bun and Node.js)
 */
export async function fileExists(path: string): Promise<boolean> {
    if (isBun) {
        // @ts-ignore - Bun global
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
