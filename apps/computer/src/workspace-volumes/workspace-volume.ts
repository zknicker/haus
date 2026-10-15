import { chmod, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { hostWorkspaceDisk, type WorkspaceDisk } from './disk-image.ts';
import {
    isMissing,
    readJson,
    reserveWorkspace,
    type WorkspaceOptions,
    withStorageLock,
    workspaceDefaults,
    writeJson,
} from './storage-ledger.ts';
import {
    type BusyVolumePolicy,
    type DetachOutcome,
    type DetachPacing,
    detachWorkspaceVolume,
} from './volume-detach.ts';

export const workspaceVolumeSchema = z.object({
    capacityBytes: z.number().int().positive(),
    volumeUuid: z.string().min(1),
});
export interface WorkspaceLocation {
    agentRoot: string;
    dataRoot: string;
    disk?: WorkspaceDisk | null;
    options?: WorkspaceOptions;
}
export type WorkspaceState =
    | { kind: 'legacy'; path: string }
    | { kind: 'uncapped'; path: string }
    | { kind: 'capped'; path: string; capacityBytes: number };

/** Existing directories are explicit legacy state, never silently migrated. */
export function ensureAgentWorkspace(input: WorkspaceLocation): Promise<WorkspaceState> {
    return withStorageLock(input.dataRoot, () => ensureWorkspaceLocked(input));
}

export async function ensureWorkspaceLocked(input: WorkspaceLocation): Promise<WorkspaceState> {
    const disk = input.disk === undefined ? hostWorkspaceDisk : input.disk;
    if (!disk) {
        return await ensureUncappedWorkspace(input.agentRoot);
    }
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
    disk: WorkspaceDisk | null = hostWorkspaceDisk
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
    if ((await mountUuid(requireCappedDisk(disk), path)) !== record.volumeUuid) {
        throw new Error('Cannot reset an unmounted capped workspace.');
    }
    for (const entry of await readdir(path)) {
        await rm(join(path, entry), { force: true, recursive: true });
    }
}

/**
 * Detaches an Agent's own capped volume. Rejects, leaving it mounted, when it stays busy
 * under the `fail` policy or a forced detach fails; callers keep its reservation then.
 */
export async function detachAgentWorkspace(input: {
    agentRoot: string;
    disk?: WorkspaceDisk | null;
    onBusy: BusyVolumePolicy;
    pacing?: DetachPacing;
}): Promise<DetachOutcome | null> {
    const { manifest, path } = workspaceVolumePaths(input.agentRoot);
    const record = await readJson(manifest, workspaceVolumeSchema);
    if (!record) {
        return null;
    }
    const disk = requireCappedDisk(input.disk === undefined ? hostWorkspaceDisk : input.disk);
    const mounted = await mountUuid(disk, path);
    if (mounted && mounted !== record.volumeUuid) {
        throw new Error('Cannot detach a foreign workspace volume.');
    }
    if (!mounted) {
        return null;
    }
    return await detachWorkspaceVolume({
        disk,
        mountpoint: path,
        onBusy: input.onBusy,
        ...(input.pacing ? { pacing: input.pacing } : {}),
    });
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

/** Off macOS a workspace is an ordinary directory: no volume, cap, or reservation. */
async function ensureUncappedWorkspace(agentRoot: string): Promise<WorkspaceState> {
    const { image, manifest, path } = workspaceVolumePaths(agentRoot);
    if ((await exists(manifest)) || (await exists(image))) {
        // Never hide or replace a capped workspace's files with an empty directory.
        throw new Error('This workspace is a capped macOS volume; open it on macOS.');
    }
    await mkdir(path, { recursive: true, mode: 0o700 });
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error('Workspace must be an ordinary directory.');
    }
    return { kind: 'uncapped', path };
}

function requireCappedDisk(disk: WorkspaceDisk | null) {
    if (!disk) {
        throw new Error('This workspace is a capped macOS volume; open it on macOS.');
    }
    return disk;
}

async function assertImageExists(image: string) {
    if (!(await exists(image))) {
        throw new Error('Capped workspace image is missing; refusing an uncapped replacement.');
    }
}
