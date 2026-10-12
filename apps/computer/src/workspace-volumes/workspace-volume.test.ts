import { expect, test } from 'bun:test';
import {
    mkdir,
    mkdtemp,
    open,
    readdir,
    readFile,
    rename,
    rm,
    symlink,
    unlink,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { macWorkspaceDisk } from './disk-image.ts';
import { compactAgentWorkspace, migrateAgentWorkspace } from './maintenance.ts';
import { ensureAgentWorkspace, resetWorkspaceContents } from './workspace-volume.ts';

const macTest = test.skipIf(process.platform !== 'darwin');
macTest('legacy workspace is preserved and never silently migrated', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-volume-legacy-'));
    const agentRoot = join(root, 'agent');
    await mkdir(join(agentRoot, 'workspace'), { recursive: true });
    await writeFile(join(agentRoot, 'workspace', 'personal.txt'), 'personal');
    try {
        expect(await ensureAgentWorkspace({ dataRoot: root, agentRoot })).toMatchObject({
            kind: 'legacy',
        });
        expect(await readFile(join(agentRoot, 'workspace', 'personal.txt'), 'utf8')).toBe(
            'personal'
        );
        expect(await readdir(agentRoot)).toEqual(['workspace']);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

macTest('missing capped image fails closed without making a replacement workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-volume-missing-'));
    const agentRoot = join(root, 'agent');
    await mkdir(agentRoot);
    await writeFile(
        join(agentRoot, 'workspace-volume.json'),
        JSON.stringify({ capacityBytes: 128 * 1024 ** 2, volumeUuid: 'missing' })
    );
    try {
        await expect(ensureAgentWorkspace({ dataRoot: root, agentRoot })).rejects.toThrow(
            'image is missing'
        );
        expect(await readdir(agentRoot)).toEqual(['workspace-volume.json']);
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

const live = process.platform === 'darwin' && process.env.HAUS_RUN_WORKSPACE_VOLUME_TEST === '1';
test.skipIf(!live)(
    'macOS cap, remount, reset, migration backup and compaction',
    async () => {
        const root = await mkdtemp(join(tmpdir(), 'haus-volume-live-'));
        const agentRoot = join(root, 'agent');
        const options = {
            capacityBytes: 128 * 1024 ** 2,
            cacheBytes: 1024 ** 2,
            reserveBytes: 1024 ** 2,
        };
        const input = {
            agentRoot,
            dataRoot: root,
            options,
            assertComputerStopped: async () => undefined,
        };
        let mountedPath: string | null = null;
        try {
            const state = await ensureAgentWorkspace(input);
            expect(state.kind).toBe('capped');
            mountedPath = state.path;
            const path = state.path;
            await writeFile(join(path, 'A'), 'upper');
            await writeFile(join(path, 'a'), 'lower');
            expect(await readFile(join(path, 'A'), 'utf8')).toBe('upper');
            const handle = await open(join(path, 'fill'), 'w');
            let full = false;
            let writeFailure: unknown;
            try {
                for (let count = 0; count < 256; count++) {
                    await handle.write(Buffer.alloc(1024 ** 2, 1));
                }
            } catch (error) {
                writeFailure = error;
                full = error instanceof Error && 'code' in error && error.code === 'ENOSPC';
            } finally {
                await handle.close();
            }
            expect(writeFailure).toBeDefined();
            expect(full).toBe(true);
            await writeFile(join(agentRoot, 'session.json'), 'recovery remains writable');
            await unlink(join(path, 'fill'));
            await writeFile(join(path, 'recovered'), 'ok');
            await macWorkspaceDisk.detach(path);
            mountedPath = null;
            await ensureAgentWorkspace(input);
            mountedPath = path;
            expect(await readFile(join(path, 'recovered'), 'utf8')).toBe('ok');
            await compactAgentWorkspace(input);
            await resetWorkspaceContents(agentRoot);
            expect(await readdir(path)).toEqual([]);
            await macWorkspaceDisk.detach(path);
            mountedPath = null;
            await rm(agentRoot, { recursive: true });
            await mkdir(path, { recursive: true });
            await writeFile(join(path, '.hidden'), 'keep');
            await symlink('.hidden', join(path, 'link'));
            const migratedRoot = join(root, 'migrated');
            await mkdir(migratedRoot);
            await rename(path, join(migratedRoot, 'workspace'));
            await expect(
                migrateAgentWorkspace({
                    ...input,
                    agentRoot: migratedRoot,
                    disk: {
                        ...macWorkspaceDisk,
                        create: async () => {
                            throw new Error('creation interrupted');
                        },
                    },
                })
            ).rejects.toThrow('creation interrupted');
            expect(await readFile(join(migratedRoot, 'workspace', '.hidden'), 'utf8')).toBe('keep');
            const migrated = await migrateAgentWorkspace({ ...input, agentRoot: migratedRoot });
            mountedPath = migrated.path;
            expect(await readFile(join(migrated.backup, '.hidden'), 'utf8')).toBe('keep');
            expect(await readFile(join(migrated.path, 'link'), 'utf8')).toBe('keep');
            await macWorkspaceDisk.detach(migrated.path);
            mountedPath = null;
            expect(await readdir(migratedRoot)).toContain('workspace.backup');
        } finally {
            if (mountedPath) {
                await macWorkspaceDisk.detach(mountedPath);
            }
            await rm(root, { force: true, recursive: true });
        }
    },
    120_000
);
