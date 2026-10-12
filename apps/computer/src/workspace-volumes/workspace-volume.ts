import { chmod, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { macWorkspaceDisk, type WorkspaceDisk } from './disk-image.ts';
import {
    isMissing,
    readJson,
    reserveWorkspace,
    type WorkspaceOptions,
    withStorageLock,
    workspaceDefaults,
    writeJson,
} from './storage-ledger.ts';

export const workspaceVolumeSchema = z.object({
    capacityBytes: z.number().int().positive(),
    volumeUuid: z.string().min(1),
});
export interface WorkspaceLocation {
    agentRoot: string;
    dataRoot: string;
    disk?: WorkspaceDisk;
    options?: WorkspaceOptions;
}
export type WorkspaceState =
    | { kind: 'legacy'; path: string }
    | { kind: 'capped'; path: string; capacityBytes: number };

/** Existing directories are explicit legacy state, never silently migrated. */
export function ensureAgentWorkspace(input: WorkspaceLocation): Promise<WorkspaceState> {
    return withStorageLock(input.dataRoot, () => ensureWorkspaceLocked(input));
}

export async function ensureWorkspaceLocked(input: WorkspaceLocation): Promise<WorkspaceState> {
    const disk = input.disk ?? macWorkspaceDisk;
    const options = input.options ?? workspaceDefaults;
    const { image, manifest, path } = workspaceVolumePaths(input.agentRoot);
    await mkdir(input.agentRoot, { recursive: true, mode: 0o700 });
    const record = await readJson(manifest, workspaceVolumeSchema);
    if (record) {
        await assertImageExists(image);
        const mounted = await mountUuid(disk, path);
        if (mounted && mounted !== record.volumeUuid) {
            throw new Error('Workspace mount belongs to another volume.');
        }
        if (!mounted) {
            await assertEmptyMountpoint(path);
            const uuid = await disk.mount(image, path);
            if (uuid !== record.volumeUuid) {
                throw new Error('Workspace image identity changed.');
            }
        }
        return { capacityBytes: record.capacityBytes, kind: 'capped', path };
    }
    if (await exists(image)) {
        throw new Error('Workspace image has no verified manifest; recover it before launching.');
    }
    if (await exists(path)) {
        const info = await lstat(path);
        if (!info.isDirectory() || info.isSymbolicLink()) {
            throw new Error('Workspace must be an ordinary directory or a verified capped volume.');
        }
        if (await mountUuid(disk, path)) {
            throw new Error('Workspace is mounted without a verified manifest.');
        }
        return { kind: 'legacy', path };
    }
    await reserveWorkspace(input.dataRoot, input.agentRoot, options);
    await disk.create(image, options.capacityBytes);
    await mkdir(path, { mode: 0o500 });
    const volumeUuid = await disk.mount(image, path);
    await writeJson(manifest, { capacityBytes: options.capacityBytes, volumeUuid });
    await chmod(path, 0o700);
    return { capacityBytes: options.capacityBytes, kind: 'capped', path };
}

export async function resetWorkspaceContents(
    agentRoot: string,
    disk: WorkspaceDisk = macWorkspaceDisk
) {
    const { manifest, path } = workspaceVolumePaths(agentRoot);
    const record = await readJson(manifest, workspaceVolumeSchema);
    if (!record) {
        if (await exists(workspaceVolumePaths(agentRoot).image)) {
            throw new Error('Workspace image is unverified; recover it before reset.');
        }
        await rm(path, { force: true, recursive: true });
        return;
    }
    if ((await mountUuid(disk, path)) !== record.volumeUuid) {
        throw new Error('Cannot reset an unmounted capped workspace.');
    }
    for (const entry of await readdir(path)) {
        await rm(join(path, entry), { force: true, recursive: true });
    }
}

export async function detachWorkspaceForRetirement(
    agentRoot: string,
    disk: WorkspaceDisk = macWorkspaceDisk
) {
    const { manifest, path } = workspaceVolumePaths(agentRoot);
    const record = await readJson(manifest, workspaceVolumeSchema);
    if (!record) {
        return;
    }
    const mounted = await mountUuid(disk, path);
    if (mounted && mounted !== record.volumeUuid) {
        throw new Error('Cannot detach a foreign workspace volume.');
    }
    if (mounted) {
        await disk.detach(path);
    }
}

export function workspaceVolumePaths(agentRoot: string) {
    return {
        image: join(agentRoot, 'workspace.sparsebundle'),
        manifest: join(agentRoot, 'workspace-volume.json'),
        path: join(agentRoot, 'workspace'),
    };
}

export async function assertEmptyMountpoint(path: string) {
    if ((await exists(path)) && (await readdir(path)).length > 0) {
        throw new Error('Unmounted workspace contains files; refusing to hide them with a mount.');
    }
}

export async function mountUuid(disk: WorkspaceDisk, path: string) {
    return (await exists(path)) ? disk.mountedUuid(path) : null;
}

export async function exists(path: string) {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (isMissing(error)) {
            return false;
        }
        throw error;
    }
}

async function assertImageExists(image: string) {
    if (!(await exists(image))) {
        throw new Error('Capped workspace image is missing; refusing an uncapped replacement.');
    }
}
