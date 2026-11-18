import { readdir, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { hostWorkspaceDisk, type WorkspaceDisk } from './disk-image.ts';
import { isMissing, releaseOrphanedWorkspaces, withStorageLock } from './storage-ledger.ts';
import {
    type BusyVolumePolicy,
    type DetachPacing,
    detachWorkspaceVolume,
} from './volume-detach.ts';
import { detachAgentWorkspace, exists, workspaceVolumePaths } from './workspace-volume.ts';

interface VolumeHost {
    dataRoot: string;
    disk?: WorkspaceDisk | null;
    pacing?: DetachPacing;
}
export interface StaleWorkspaceReclaim {
    detached: string[];
    failed: string[];
    released: string[];
}

/**
 * Detaches every mounted workspace in one Server partition. Shutdown uses `fail` so a
 * busy volume stays mounted and reopens next start; Server deletion uses `force`, which
 * also detaches any mount left under the partition, manifest or not, so its removal never
 * recurses into a volume. Runs without the storage lock: the holder waits and retries
 * can take seconds, and the caller's sessions are already stopped. Returns the agent
 * roots or mountpoints still mounted, after logging each failure.
 */
export async function detachServerWorkspaces(
    input: VolumeHost & { onBusy: BusyVolumePolicy; serverId: string }
): Promise<string[]> {
    const disk = input.disk === undefined ? hostWorkspaceDisk : input.disk;
    if (!disk) {
        return [];
    }
    const partitionRoot = join(input.dataRoot, 'servers', input.serverId);
    const agentsRoot = join(partitionRoot, 'agents');
    const stuck: string[] = [];
    for (const agentId of await listDirectories(agentsRoot)) {
        const agentRoot = join(agentsRoot, agentId);
        try {
            await detachAgentWorkspace({
                agentRoot,
                disk,
                onBusy: input.onBusy,
                ...(input.pacing ? { pacing: input.pacing } : {}),
            });
        } catch (error) {
            stuck.push(agentRoot);
            console.error(
                `Workspace volume for ${agentRoot} is still mounted: ${errorMessage(error)}`
            );
        }
    }
    // Under force the mount sweep is authoritative: it retries any volume above.
    return input.onBusy === 'force'
        ? await detachMountsUnder({ ...input, disk, root: partitionRoot })
        : stuck;
}

/**
 * Force-detaches every mount at or below `root`, deepest first, before a caller removes
 * that tree. Returns the mountpoints that stayed mounted, after logging each failure.
 */
export async function detachMountsUnder(input: VolumeHost & { root: string }): Promise<string[]> {
    const disk = input.disk === undefined ? hostWorkspaceDisk : input.disk;
    if (!disk) {
        return [];
    }
    const stuck: string[] = [];
    const mounts = await mountsUnder(disk, input.root);
    for (const mountpoint of mounts.sort((left, right) => right.length - left.length)) {
        try {
            await detachWorkspaceVolume({
                disk,
                mountpoint,
                onBusy: 'force',
                ...(input.pacing ? { pacing: input.pacing } : {}),
            });
            console.warn(`Detached leftover mount ${mountpoint} before removing ${input.root}.`);
        } catch (error) {
            stuck.push(mountpoint);
            console.error(`Workspace mount ${mountpoint} is still mounted: ${errorMessage(error)}`);
        }
    }
    return stuck;
}

/**
 * Computer start: a mounted workspace whose Agent partition has no volume manifest
 * belongs to an Agent or Server that no longer exists here, so detach it, then drop
 * reservations whose partition holds no volume. Live volumes always keep a manifest.
 */
export async function reclaimStaleWorkspaces(input: VolumeHost): Promise<StaleWorkspaceReclaim> {
    const disk = input.disk === undefined ? hostWorkspaceDisk : input.disk;
    const result: StaleWorkspaceReclaim = { detached: [], failed: [], released: [] };
    if (!disk) {
        return result;
    }
    return await withStorageLock(input.dataRoot, async () => {
        const serversRoot = join(await realpath(input.dataRoot), 'servers');
        for (const mountpoint of await disk.mounts()) {
            const agentRoot = workspaceOwner(serversRoot, mountpoint);
            if (!agentRoot || (await exists(workspaceVolumePaths(agentRoot).manifest))) {
                continue;
            }
            try {
                const outcome = await detachWorkspaceVolume({
                    disk,
                    mountpoint,
                    onBusy: 'force',
                    ...(input.pacing ? { pacing: input.pacing } : {}),
                });
                result.detached.push(mountpoint);
                console.warn(
                    `Reclaimed stale workspace mount ${mountpoint} (${outcome.kind}): its Agent partition has no volume manifest.`
                );
            } catch (error) {
                result.failed.push(mountpoint);
                console.error(
                    `Stale workspace mount ${mountpoint} could not be reclaimed: ${errorMessage(error)}`
                );
            }
        }
        result.released = await releaseVacantLocked(input.dataRoot);
        return result;
    });
}

/** Drops reservations of partitions that no longer hold a volume, such as a purged Server. */
export function releaseVacantReservations(dataRoot: string): Promise<string[]> {
    return withStorageLock(dataRoot, () => releaseVacantLocked(dataRoot));
}

async function releaseVacantLocked(dataRoot: string): Promise<string[]> {
    const released = await releaseOrphanedWorkspaces(dataRoot, holdsVolume);
    if (released.length > 0) {
        console.warn(`Released workspace reservations with no volume: ${released.join(', ')}`);
    }
    return released;
}

/** Partitions keep a reservation while any volume artifact or migration receipt exists. */
async function holdsVolume(agentRoot: string): Promise<boolean> {
    const { image, manifest } = workspaceVolumePaths(agentRoot);
    for (const path of [manifest, image, join(agentRoot, 'workspace-migration.json')]) {
        if (await exists(path)) {
            return true;
        }
    }
    return false;
}

function workspaceOwner(serversRoot: string, mountpoint: string): string | null {
    if (!mountpoint.startsWith(`${serversRoot}${sep}`)) {
        return null;
    }
    const parts = mountpoint.slice(serversRoot.length + 1).split(sep);
    const [serverId, agents, agentId, workspace] = parts;
    if (parts.length !== 4 || agents !== 'agents' || workspace !== 'workspace') {
        return null;
    }
    return serverId && agentId ? join(serversRoot, serverId, 'agents', agentId) : null;
}

async function mountsUnder(disk: WorkspaceDisk, root: string): Promise<string[]> {
    let canonical: string;
    try {
        canonical = await realpath(root);
    } catch (error) {
        if (isMissing(error)) {
            return [];
        }
        throw error;
    }
    return (await disk.mounts()).filter(
        (mountpoint) => mountpoint === canonical || mountpoint.startsWith(`${canonical}${sep}`)
    );
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export async function listDirectories(root: string): Promise<string[]> {
    try {
        const entries = await readdir(root, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
        if (isMissing(error)) {
            return [];
        }
        throw error;
    }
}
