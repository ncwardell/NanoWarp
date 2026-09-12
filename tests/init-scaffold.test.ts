import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

const CLI = path.resolve(__dirname, '../src/cli/init.ts');
const BUN_BIN = process.execPath;

let workDir: string;

beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nw-init-'));
});

afterEach(async () => {
    await fs.remove(workDir);
});

async function runInit(args: string[], opts: { cwd?: string } = {}): Promise<{
    code: number;
    stdout: string;
    stderr: string;
}> {
    const proc = Bun.spawn([BUN_BIN, CLI, ...args], {
        cwd: opts.cwd ?? workDir,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const code = await proc.exited;
    return { code, stdout, stderr };
}

describe('nanowarp-init scaffold', () => {
    it('creates a complete project layout in a named subdirectory', async () => {
        const result = await runInit(['my-api']);
        expect(result.code).toBe(0);

        const root = path.join(workDir, 'my-api');
        // Top-level files
        expect(await fs.pathExists(path.join(root, 'package.json'))).toBe(true);
        expect(await fs.pathExists(path.join(root, 'server.ts'))).toBe(true);
        expect(await fs.pathExists(path.join(root, '.gitignore'))).toBe(true);
        expect(await fs.pathExists(path.join(root, 'README.md'))).toBe(true);
        expect(await fs.pathExists(path.join(root, 'docker-compose.yml'))).toBe(true);

        // All five method directories present
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
            expect(await fs.pathExists(path.join(root, 'data', 'Endpoints', method))).toBe(true);
        }

        // The sample endpoint exists
        expect(await fs.pathExists(path.join(root, 'data', 'Endpoints', 'GET', 'health.ts'))).toBe(true);

        // The apikeys template (named .example so it doesn't activate auth by default)
        expect(await fs.pathExists(path.join(root, 'data', 'apikeys.json.example'))).toBe(true);
    });

    it('writes a package.json with the directory name and nanowarp dep', async () => {
        await runInit(['todo-api']);
        const pkg = JSON.parse(await fs.readFile(path.join(workDir, 'todo-api', 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('todo-api');
        expect(pkg.dependencies.nanowarp).toBeDefined();
        expect(pkg.scripts.dev).toBeDefined();
        expect(pkg.scripts.start).toBeDefined();
    });

    it('writes a server.ts that imports from nanowarp', async () => {
        await runInit(['x']);
        const server = await fs.readFile(path.join(workDir, 'x', 'server.ts'), 'utf-8');
        expect(server).toContain("from 'nanowarp'");
        expect(server).toContain('NanoWarp');
        expect(server).toContain('await server.start()');
    });

    it('skips docker-compose.yml when --no-docker is passed', async () => {
        await runInit(['minimal', '--no-docker']);
        const root = path.join(workDir, 'minimal');
        expect(await fs.pathExists(path.join(root, 'docker-compose.yml'))).toBe(false);
        // Other files should still be there
        expect(await fs.pathExists(path.join(root, 'package.json'))).toBe(true);
    });

    it('refuses to overwrite a non-empty directory without --force', async () => {
        const root = path.join(workDir, 'existing');
        await fs.ensureDir(root);
        await fs.writeFile(path.join(root, 'something.txt'), 'pre-existing');

        const result = await runInit(['existing']);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('not empty');
        // Pre-existing file is untouched
        expect(await fs.readFile(path.join(root, 'something.txt'), 'utf-8')).toBe('pre-existing');
    });

    it('overwrites with --force', async () => {
        const root = path.join(workDir, 'existing');
        await fs.ensureDir(root);
        await fs.writeFile(path.join(root, 'package.json'), '{"name":"old"}');

        const result = await runInit(['existing', '--force']);
        expect(result.code).toBe(0);

        const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('existing'); // overwritten
    });

    it('scaffolds into the current directory when name is "."', async () => {
        const result = await runInit(['.']);
        expect(result.code).toBe(0);
        expect(await fs.pathExists(path.join(workDir, 'package.json'))).toBe(true);
        expect(await fs.pathExists(path.join(workDir, 'data', 'Endpoints', 'GET', 'health.ts'))).toBe(true);
    });

    it('the scaffolded server boots and the sample /health endpoint responds', async () => {
        // Scaffold a project, then run its server and hit /health.
        await runInit(['runnable']);
        const root = path.join(workDir, 'runnable');

        // Pick a random-ish port to avoid conflicts.
        const port = 49000 + (process.pid % 100);

        const proc = Bun.spawn([BUN_BIN, 'server.ts'], {
            cwd: root,
            env: { ...process.env, PORT: String(port) },
            stdout: 'ignore',
            stderr: 'ignore',
        });

        try {
            // Wait for the server to come up.
            for (let i = 0; i < 20; i++) {
                try {
                    const res = await fetch(`http://localhost:${port}/health`);
                    if (res.status === 200) {
                        const body = await res.json();
                        expect(body.ok).toBe(true);
                        expect(typeof body.ts).toBe('string');
                        return; // success
                    }
                } catch {}
                await new Promise(r => setTimeout(r, 250));
            }
            throw new Error('Scaffolded server did not respond within timeout');
        } finally {
            proc.kill();
            await proc.exited.catch(() => {});
        }
    });
});
