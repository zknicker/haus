import { expect, test } from 'bun:test';
import {
    chmod,
    mkdir,
    mkdtemp,
    open,
    readdir,
    readFile,
    rename,
    rm,
    stat,
    symlink,
    writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkspaceDisk } from './disk-image.ts';
import { ensureAgentWorkspace } from './workspace-volume.ts';

async function fixture() {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-workspace-directory-'));
    const agentRoot = join(dataRoot, 'agent');
    const path = join(agentRoot, 'workspace');
    const image = join(agentRoot, 'workspace.sparsebundle');
    await mkdir(join(image, 'contents'), { recursive: true });
    await writeFile(join(image, 'contents', '.memory'), 'keep this');
    await chmod(join(image, 'contents', '.memory'), 0o600);
    await symlink('.memory', join(image, 'contents', 'memory-link'));
    await writeFile(
        join(agentRoot, 'workspace-volume.json'),
        JSON.stringify({ capacityBytes: 10 * 1024 ** 3, volumeUuid: 'volume' })
    );
    let mounted = false;
    let busy = false;
    const disk: WorkspaceDisk = {
        create: async () => {
            throw new Error('Must never create a capped image');
        },
        compact: async () => undefined,
        mount: async () => {
            if (await stat(path).catch(() => null)) {
                await rename(path, join(agentRoot, `mountpoint-${Date.now()}`));
            }
            await rename(join(image, 'contents'), path);
            mounted = true;
            return 'volume';
        },
        mountedUuid: async () => (mounted ? 'volume' : null),
        holders: async () => (busy ? [{ command: 'agent', pid: 10 }] : []),
        detach: async () => {
            if (busy) {
                throw new Error('busy');
            }
            await rename(path, join(image, 'contents'));
            await mkdir(path);
            mounted = false;
        },
        mounts: async () => (mounted ? [path] : []),
    };
    return {
        dataRoot,
        agentRoot,
        path,
        image,
        disk,
        setBusy: (value: boolean) => {
            busy = value;
        },
    };
}

test('new workspaces have no cap or reservation, even with an exhausted old ledger', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-no-reservation-'));
    try {
        const agentRoot = join(dataRoot, 'agent');
        await writeFile(
            join(dataRoot, 'workspace-storage.json'),
            JSON.stringify({ budgetBytes: 0, allocations: {} })
        );
        const workspace = await ensureAgentWorkspace({ dataRoot, agentRoot });
        expect(workspace).toEqual({ kind: 'uncapped', path: join(agentRoot, 'workspace') });
        const file = await open(join(workspace.path, 'large-file'), 'w');
        try {
            await file.truncate(11 * 1024 ** 3);
        } finally {
            await file.close();
        }
        expect((await stat(join(workspace.path, 'large-file'))).size).toBe(11 * 1024 ** 3);
        expect(await readdir(agentRoot)).toEqual(['workspace']);
    } finally {
        await rm(dataRoot, { recursive: true, force: true });
    }
});

test('existing capped workspace becomes a plain directory with verified files and a recovery image', async () => {
    const f = await fixture();
    try {
        await writeFile(
            join(f.dataRoot, 'workspace-storage.json'),
            JSON.stringify({ budgetBytes: 1, allocations: { [f.agentRoot]: 10 } })
        );
        expect(await ensureAgentWorkspace(f)).toEqual({ kind: 'uncapped', path: f.path });
        expect(await readFile(join(f.path, 'memory-link'), 'utf8')).toBe('keep this');
        expect((await stat(join(f.path, '.memory'))).mode & 0o777).toBe(0o600);
        expect(
            await readFile(
                join(f.agentRoot, 'workspace.backup.sparsebundle', 'contents', '.memory'),
                'utf8'
            )
        ).toBe('keep this');
        expect(
            JSON.parse(await readFile(join(f.dataRoot, 'workspace-storage.json'), 'utf8'))
                .allocations
        ).toEqual({});
        await writeFile(join(f.path, 'new-note'), 'new work');
        await ensureAgentWorkspace(f);
        expect(await readFile(join(f.path, 'new-note'), 'utf8')).toBe('new work');
    } finally {
        await rm(f.dataRoot, { recursive: true, force: true });
    }
});

test('busy or foreign volumes fail without replacing personal files', async () => {
    const f = await fixture();
    try {
        f.setBusy(true);
        await expect(ensureAgentWorkspace(f)).rejects.toThrow('in use');
        expect(await readFile(join(f.path, '.memory'), 'utf8')).toBe('keep this');
        f.setBusy(false);
        await expect(
            ensureAgentWorkspace({ ...f, disk: { ...f.disk, mountedUuid: async () => 'foreign' } })
        ).rejects.toThrow('another volume');
        await ensureAgentWorkspace(f);
    } finally {
        await rm(f.dataRoot, { recursive: true, force: true });
    }
});

test('a detach failure resumes safely on retry', async () => {
    const f = await fixture();
    try {
        await expect(
            ensureAgentWorkspace({
                ...f,
                disk: {
                    ...f.disk,
                    detach: async () => {
                        throw new Error('detach interrupted');
                    },
                },
            })
        ).rejects.toThrow('detach interrupted');
        expect(await readFile(join(f.path, '.memory'), 'utf8')).toBe('keep this');
        await ensureAgentWorkspace(f);
        expect(await readFile(join(f.path, '.memory'), 'utf8')).toBe('keep this');
    } finally {
        await rm(f.dataRoot, { recursive: true, force: true });
    }
});

test('a capped image cannot be silently replaced on a host without disk image support', async () => {
    const f = await fixture();
    try {
        await expect(ensureAgentWorkspace({ ...f, disk: null })).rejects.toThrow(
            'capped macOS volume'
        );
    } finally {
        await rm(f.dataRoot, { recursive: true, force: true });
    }
});

const liveVolumeTest = test.skipIf(
    process.platform !== 'darwin' || process.env.HAUS_RUN_WORKSPACE_VOLUME_TEST !== '1'
);
liveVolumeTest(
    'converts a real APFS image to an uncapped directory and retains the original',
    async () => {
        const { macWorkspaceDisk } = await import('./disk-image.ts');
        const dataRoot = await mkdtemp(join(tmpdir(), 'haus-apfs-conversion-'));
        const agentRoot = join(dataRoot, 'agent');
        const path = join(agentRoot, 'workspace');
        const image = join(agentRoot, 'workspace.sparsebundle');
        try {
            await mkdir(agentRoot);
            await macWorkspaceDisk.create(image, 256 * 1024 ** 2);
            const volumeUuid = await macWorkspaceDisk.mount(image, path);
            await writeFile(join(path, '.memory'), 'real APFS content');
            await chmod(join(path, '.memory'), 0o600);
            await symlink('.memory', join(path, 'link'));
            await macWorkspaceDisk.detach(path);
            await writeFile(
                join(agentRoot, 'workspace-volume.json'),
                JSON.stringify({ capacityBytes: 256 * 1024 ** 2, volumeUuid })
            );
            await ensureAgentWorkspace({ dataRoot, agentRoot });
            expect(await macWorkspaceDisk.mountedUuid(path)).toBeNull();
            expect((await stat(path)).dev).toBe((await stat(dataRoot)).dev);
            expect(await readFile(join(path, 'link'), 'utf8')).toBe('real APFS content');
            expect((await stat(join(path, '.memory'))).mode & 0o777).toBe(0o600);
            const file = await open(join(path, 'beyond-old-cap'), 'w');
            try {
                await file.truncate(11 * 1024 ** 3);
            } finally {
                await file.close();
            }
            expect((await stat(join(path, 'beyond-old-cap'))).size).toBe(11 * 1024 ** 3);
            const recovery = join(agentRoot, 'recovery');
            await macWorkspaceDisk.mount(
                join(agentRoot, 'workspace.backup.sparsebundle'),
                recovery
            );
            try {
                expect(await readFile(join(recovery, '.memory'), 'utf8')).toBe('real APFS content');
            } finally {
                await macWorkspaceDisk.detach(recovery);
            }
        } finally {
            if (
                (await stat(path).catch(() => null)) &&
                (await macWorkspaceDisk.mountedUuid(path))
            ) {
                await macWorkspaceDisk.detach(path);
            }
            await rm(dataRoot, { recursive: true, force: true });
        }
    },
    120_000
);
