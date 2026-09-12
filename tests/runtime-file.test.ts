import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
    writeFileRuntime,
    readJsonFile,
    readFileAsArrayBuffer,
    fileExists,
} from '../src/runtime/file';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-runtime-'));
});

afterEach(async () => {
    await fs.remove(tmpDir);
});

describe('runtime/file', () => {
    it('writeFileRuntime then readJsonFile round-trips', async () => {
        const p = `${tmpDir}/x.json`;
        await writeFileRuntime(p, JSON.stringify({ a: 1, nested: { b: [1, 2, 3] } }));
        expect(await readJsonFile(p)).toEqual({ a: 1, nested: { b: [1, 2, 3] } });
    });

    it('fileExists returns false for a missing path', async () => {
        expect(await fileExists(`${tmpDir}/nope`)).toBe(false);
    });

    it('fileExists returns true for an existing file', async () => {
        await fs.writeFile(`${tmpDir}/here`, 'x');
        expect(await fileExists(`${tmpDir}/here`)).toBe(true);
    });

    it('readFileAsArrayBuffer returns matching bytes', async () => {
        await fs.writeFile(`${tmpDir}/bin`, Buffer.from([0x01, 0x02, 0x03, 0x04]));
        const ab = await readFileAsArrayBuffer(`${tmpDir}/bin`);
        expect(ab.byteLength).toBe(4);
        expect(Array.from(new Uint8Array(ab))).toEqual([1, 2, 3, 4]);
    });

    it('readJsonFile throws on invalid JSON', async () => {
        const p = `${tmpDir}/bad.json`;
        await fs.writeFile(p, '{not valid json');
        await expect(readJsonFile(p)).rejects.toThrow();
    });
});
