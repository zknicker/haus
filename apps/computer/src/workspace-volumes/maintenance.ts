import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, cp, lstat, mkdir, readdir, readlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { macWorkspaceDisk } from './disk-image.ts';
import {
    readJson,
    reserveWorkspace,
    withStorageLock,
    workspaceDefaults,
    writeJson,
} from './storage-ledger.ts';
import {
    assertEmptyMountpoint,
    exists,
    mountUuid,
    type WorkspaceLocation,
    workspaceVolumePaths,
    workspaceVolumeSchema,
} from './workspace-volume.ts';

export interface WorkspaceMaintenance extends WorkspaceLocation {
    /** Must reject while any Computer daemon or native Agent process can use this workspace. */
    assertComputerStopped(): Promise<void>;
}
const migrationSchema = z.object({
    stage: z.enum(['creating', 'copying', 'verified', 'backed-up', 'complete']),
    capacityBytes: z.number().int().positive(),
    volumeUuid: z.string().nullable(),
});

/** The original remains as workspace.backup; no automatic source deletion. */
export function migrateAgentWorkspace(input: WorkspaceMaintenance) {
    return withStorageLock(input.dataRoot, async () => {
        await input.assertComputerStopped();
        const disk = input.disk ?? macWorkspaceDisk;
        const { manifest, path } = workspaceVolumePaths(input.agentRoot);
        const staging = join(input.agentRoot, 'workspace-migration-mount');
        const backup = join(input.agentRoot, 'workspace.backup');
        const receipt = join(input.agentRoot, 'workspace-migration.json');
        let migration = await readJson(receipt, migrationSchema);
        migration ??= await beginMigration(input);
        if (migration.stage === 'creating') {
            migration = await createMigration(input, migration);
        }
        if (!migration.volumeUuid) {
            throw new Error('Migration volume identity is missing.');
        }
        const volumeUuid = migration.volumeUuid;
        if (migration.stage === 'complete') {
            await mountMigration(input, volumeUuid);
            return { backup, path };
        }
        if (migration.stage === 'copying') {
            await copyMigration(input, migration);
            migration = { ...migration, stage: 'verified' };
            await writeJson(receipt, migration);
        }
        if (migration.stage === 'verified') {
            if (await mountUuid(disk, staging)) {
                await disk.detach(staging);
            }
            if (!(await exists(backup))) {
                await rename(path, backup);
            } else if (await exists(path)) {
                throw new Error(
                    'Migration backup and source both exist; refusing ambiguous recovery.'
                );
            }
            migration = { ...migration, stage: 'backed-up' };
            await writeJson(receipt, migration);
        }
        const uuid = await mountMigration(input, volumeUuid);
        await writeJson(manifest, { capacityBytes: migration.capacityBytes, volumeUuid: uuid });
        await writeJson(receipt, { ...migration, stage: 'complete' });
        return { backup, path };
    });
}

export function compactAgentWorkspace(input: WorkspaceMaintenance) {
    return withStorageLock(input.dataRoot, async () => {
        await input.assertComputerStopped();
        const disk = input.disk ?? macWorkspaceDisk;
        const { image, manifest, path } = workspaceVolumePaths(input.agentRoot);
        const record = await readJson(manifest, workspaceVolumeSchema);
        if (!record) {
            throw new Error('Only capped workspaces can be compacted.');
        }
        const mounted = await mountUuid(disk, path);
        if (mounted && mounted !== record.volumeUuid) {
            throw new Error('Workspace mount belongs to another volume.');
        }
        if (mounted) {
            await disk.detach(path);
        }
        let failure: unknown;
        try {
            await disk.compact(image);
        } catch (error) {
            failure = error;
        }
        if (mounted) {
            await assertEmptyMountpoint(path);
            if ((await disk.mount(image, path)) !== record.volumeUuid) {
                throw new Error('Workspace image identity changed after compaction.');
            }
        }
        if (failure) {
            throw failure;
        }
    });
}

async function mountMigration(input: WorkspaceMaintenance, volumeUuid: string) {
    const disk = input.disk ?? macWorkspaceDisk;
    const { image, path } = workspaceVolumePaths(input.agentRoot);
    const mounted = await mountUuid(disk, path);
    if (!mounted) {
        await assertEmptyMountpoint(path);
        await mkdir(path, { recursive: true, mode: 0o500 });
    }
    const uuid = mounted ?? (await disk.mount(image, path));
    if (uuid !== volumeUuid) {
        throw new Error('Migration final mount identity changed.');
    }
    return uuid;
}

async function beginMigration(input: WorkspaceMaintenance) {
    const disk = input.disk ?? macWorkspaceDisk;
    const options = input.options ?? workspaceDefaults;
    const { image, manifest, path } = workspaceVolumePaths(input.agentRoot);
    const backup = join(input.agentRoot, 'workspace.backup');
    if (await exists(manifest)) {
        throw new Error('Workspace is already capped.');
    }
    if (!(await exists(path)) || (await exists(backup)) || (await exists(image))) {
        throw new Error(
            'Workspace migration requires an existing directory and no prior image or backup.'
        );
    }
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink() || (await mountUuid(disk, path))) {
        throw new Error('Migration source must be an unmounted ordinary workspace directory.');
    }
    await reserveWorkspace(input.dataRoot, input.agentRoot, options);
    const migration = migrationSchema.parse({
        capacityBytes: options.capacityBytes,
        stage: 'creating',
        volumeUuid: null,
    });
    await writeJson(join(input.agentRoot, 'workspace-migration.json'), migration);
    return migration;
}

async function createMigration(
    input: WorkspaceMaintenance,
    migration: z.infer<typeof migrationSchema>
) {
    const disk = input.disk ?? macWorkspaceDisk;
    const { image } = workspaceVolumePaths(input.agentRoot);
    const staging = join(input.agentRoot, 'workspace-migration-mount');
    if (!(await exists(image))) {
        await disk.create(image, migration.capacityBytes);
    }
    await mkdir(staging, { recursive: true, mode: 0o500 });
    const volumeUuid = (await mountUuid(disk, staging)) ?? (await disk.mount(image, staging));
    const copying = { ...migration, stage: 'copying' as const, volumeUuid };
    await writeJson(join(input.agentRoot, 'workspace-migration.json'), copying);
    return copying;
}

async function copyMigration(
    input: WorkspaceMaintenance,
    migration: z.infer<typeof migrationSchema>
) {
    const disk = input.disk ?? macWorkspaceDisk;
    const { image, path } = workspaceVolumePaths(input.agentRoot);
    const staging = join(input.agentRoot, 'workspace-migration-mount');
    const uuid = (await mountUuid(disk, staging)) ?? (await disk.mount(image, staging));
    if (uuid !== migration.volumeUuid) {
        throw new Error('Migration image identity changed.');
    }
    await chmod(staging, 0o700);
    await cp(path, staging, {
        recursive: true,
        preserveTimestamps: true,
        dereference: false,
        verbatimSymlinks: true,
    });
    const sourceEntries = new Set(await readdir(path));
    const volumeMetadata = new Set(
        ['.fseventsd', '.Spotlight-V100', '.Trashes'].filter((name) => !sourceEntries.has(name))
    );
    if ((await inventoryDigest(path)) !== (await inventoryDigest(staging, volumeMetadata))) {
        throw new Error('Workspace migration copy verification failed; original preserved.');
    }
}

async function inventoryDigest(root: string, ignoredRootEntries = new Set<string>()) {
    const digest = createHash('sha256');
    async function visit(relative: string): Promise<void> {
        const path = join(root, relative);
        const info = await lstat(path);
        if (relative) {
            digest.update(JSON.stringify([relative, info.mode & 0o7777]));
        }
        if (info.isSymbolicLink()) {
            digest.update(`link:${await readlink(path)}`);
        } else if (info.isDirectory()) {
            const entries = await readdir(path, { withFileTypes: true });
            entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            for (const entry of entries) {
                if (!relative && entry.isDirectory() && ignoredRootEntries.has(entry.name)) {
                    continue;
                }
                await visit(join(relative, entry.name));
            }
        } else if (info.isFile()) {
            digest.update(`file:${info.size}:`);
            for await (const chunk of createReadStream(path)) {
                digest.update(chunk);
            }
        } else {
            throw new Error(`Workspace contains an unsupported special file: ${relative}`);
        }
    }
    await visit('');
    return digest.digest('hex');
}
