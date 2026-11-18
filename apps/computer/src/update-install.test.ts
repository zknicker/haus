import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installStandaloneExecutable, rollbackStandaloneExecutable } from './update-install.ts';

test('standalone install and rollback replace only code', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-install-test-'));
    const destination = join(root, '.local', 'bin', 'haus-computer');
    const dataPath = join(root, '.haus', 'computer', 'servers', 'srv_test', 'attachment.json');
    const artifact = join(root, 'release', 'haus-computer');
    try {
        await mkdir(join(root, '.local', 'bin'), { recursive: true });
        await mkdir(join(root, 'release'), { recursive: true });
        await mkdir(join(root, '.haus', 'computer', 'servers', 'srv_test'), {
            recursive: true,
        });
        await writeFile(destination, 'version one');
        await writeFile(artifact, 'version two');
        await writeFile(dataPath, 'durable attachment');

        await installStandaloneExecutable(artifact, {
            destination,
            verify: async () => undefined,
        });
        expect(await readFile(destination, 'utf8')).toBe('version two');
        expect(await readFile(`${destination}.prev`, 'utf8')).toBe('version one');
        expect(await readFile(dataPath, 'utf8')).toBe('durable attachment');

        await rollbackStandaloneExecutable({
            destination,
            verify: async () => undefined,
        });
        expect(await readFile(destination, 'utf8')).toBe('version one');
        expect(await readFile(`${destination}.prev`, 'utf8')).toBe('version two');
        expect(await readFile(dataPath, 'utf8')).toBe('durable attachment');
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

test('a failed atomic swap restores the running executable', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-install-failure-test-'));
    const destination = join(root, 'bin', 'haus-computer');
    const artifact = join(root, 'release', 'haus-computer');
    try {
        await mkdir(join(root, 'bin'), { recursive: true });
        await mkdir(join(root, 'release'), { recursive: true });
        await mkdir(`${destination}.prev`, { recursive: true });
        await writeFile(join(`${destination}.prev`, 'blocker'), 'force swap failure');
        await writeFile(destination, 'trusted current');
        await writeFile(artifact, 'candidate');

        await expect(
            installStandaloneExecutable(artifact, {
                destination,
                verify: async () => undefined,
            })
        ).rejects.toThrow('could not be installed');
        expect(await readFile(destination, 'utf8')).toBe('trusted current');
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});
