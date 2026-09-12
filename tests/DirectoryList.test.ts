import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DirectoryList } from '../src/database/DirectoryList';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

let tmpDir: string;

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-dl-'));
});

afterEach(async () => {
    await fs.remove(tmpDir);
});

describe('DirectoryList.buildDirectoryMap (eager)', () => {
    it('walks the full tree and records all files/dirs', async () => {
        await fs.ensureDir(`${tmpDir}/sub/inner`);
        await fs.writeFile(`${tmpDir}/sub/a.txt`, 'a');
        await fs.writeFile(`${tmpDir}/sub/inner/b.txt`, 'b');
        await fs.writeFile(`${tmpDir}/top.txt`, 'top');

        const dl = new DirectoryList(tmpDir);
        const tree = await dl.buildDirectoryMap(tmpDir);

        expect(tree.Type).toBe('directory');
        expect(tree.Descendants?.get('top.txt')?.Type).toBe('file');
        const sub = tree.Descendants?.get('sub');
        expect(sub?.Type).toBe('directory');
        expect(sub?.Descendants?.get('a.txt')?.Type).toBe('file');
        expect(sub?.Descendants?.get('inner')?.Descendants?.get('b.txt')?.Type).toBe('file');
    });
});

describe('DirectoryList.buildDirectoryMap (lazy) + loadDescendants', () => {
    it('lazy build leaves directory descendants empty until loaded', async () => {
        await fs.ensureDir(`${tmpDir}/child`);
        await fs.writeFile(`${tmpDir}/child/leaf.txt`, 'x');

        const dl = new DirectoryList(tmpDir);
        const tree = await dl.buildDirectoryMap(tmpDir, true);

        // The root has Descendants but it's empty (lazy)
        expect(tree.Type).toBe('directory');
        expect(tree.Descendants?.size).toBe(0);

        // Load descendants on-demand
        await dl.loadDescendants(tree);
        expect(tree.Descendants?.has('child')).toBe(true);

        // Lazy still applies to nested directories: 'child' is recorded but its
        // own children are not loaded.
        const child = tree.Descendants?.get('child');
        expect(child?.Type).toBe('directory');
        expect(child?.Descendants?.size).toBe(0);

        // Load child's descendants
        await dl.loadDescendants(child!);
        expect(child?.Descendants?.has('leaf.txt')).toBe(true);
    });

    it('loadDescendants is a no-op if descendants are already populated', async () => {
        await fs.writeFile(`${tmpDir}/x.txt`, 'x');
        const dl = new DirectoryList(tmpDir);
        const tree = await dl.buildDirectoryMap(tmpDir); // eager
        const sizeBefore = tree.Descendants!.size;
        await dl.loadDescendants(tree);
        expect(tree.Descendants!.size).toBe(sizeBefore);
    });
});

describe('DirectoryList.ensurePaths', () => {
    it('creates directories and files described by the tree', async () => {
        const dl = new DirectoryList(tmpDir);
        dl.EntryList = {
            Type: 'directory',
            Path: tmpDir,
            Descendants: new Map([
                ['data', {
                    Type: 'directory',
                    Path: `${tmpDir}/data`,
                    Descendants: new Map([
                        ['users.json', { Type: 'file', Path: `${tmpDir}/data/users.json` }],
                    ]),
                }],
            ]),
        };

        await dl.ensurePaths();

        expect(await fs.pathExists(`${tmpDir}/data`)).toBe(true);
        expect(await fs.pathExists(`${tmpDir}/data/users.json`)).toBe(true);
    });
});

describe('DirectoryList.getEntry', () => {
    it('finds matching filename anywhere in the tree', async () => {
        await fs.ensureDir(`${tmpDir}/a/b`);
        await fs.writeFile(`${tmpDir}/a/match.txt`, 'x');
        await fs.writeFile(`${tmpDir}/a/b/match.txt`, 'y');

        const dl = new DirectoryList(tmpDir);
        dl.EntryList = await dl.buildDirectoryMap(tmpDir);

        await dl.getEntry('match.txt');
        // EntryBuffer is private but exists at runtime; access via cast.
        const buffer = (dl as any).EntryBuffer as Record<string, any[]>;
        expect(buffer['match.txt']?.length).toBe(2);

        await dl.clearEntryBuffer();
        const cleared = (dl as any).EntryBuffer as Record<string, any[]>;
        expect(cleared['match.txt']).toBeUndefined();
    });
});
