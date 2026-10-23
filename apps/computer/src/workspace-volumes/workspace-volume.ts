import { lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { hostWorkspaceDisk, type WorkspaceDisk } from './disk-image.ts';
import { isMissing, readJson, withStorageLock } from './storage-ledger.ts';
import {
    type BusyVolumePolicy,
    type DetachOutcome,
    type DetachPacing,
    detachWorkspaceVolume,
} from './volume-detach.ts';
import { convertWorkspaceVolume, workspaceConversion } from './workspace-directory.ts';

export const workspaceVolumeSchema = z.object({
    capacityBytes: z.number().int().positive(),
    volumeUuid: z.string().min(1),
});
export interface WorkspaceLocation {
    agentRoot: string;
    dataRoot: string;
    disk?: WorkspaceDisk | null;
}
export interface WorkspaceState {
    kind: 'uncapped';
    path: string;
}

/** New workspaces are ordinary directories; older images convert before execution. */
export function ensureAgentWorkspace(input: WorkspaceLocation): Promise<WorkspaceState> {
    return withStorageLock(input.dataRoot, () => ensureWorkspaceLocked(input));
}

export async function ensureWorkspaceLocked(input: WorkspaceLocation): Promise<WorkspaceState> {
    await mkdir(input.agentRoot, { recursive: true, mode: 0o700 });
    const conversion = await workspaceConversion(input);
    if (conversion && conversion.stage !== 'complete') {
        await convertWorkspaceVolume(input, conversion.volumeUuid);
    }
    const record = await readJson(
        workspaceVolumePaths(input.agentRoot).manifest,
        workspaceVolumeSchema
    );
    if (record) {
        await convertWorkspaceVolume(input, record.volumeUuid);
    }
    return await ensureUncappedWorkspace(input.agentRoot);
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

/** Ordinary host directories have no volume, cap, or reservation. */
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
