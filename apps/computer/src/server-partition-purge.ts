import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { processExists } from './pid-lock.ts';
import {
    detachServerWorkspaces,
    listDirectories,
    releaseVacantReservations,
} from './workspace-volumes/computer-volumes.ts';
import type { WorkspaceDisk } from './workspace-volumes/disk-image.ts';
import { isMissing } from './workspace-volumes/storage-ledger.ts';
import type { DetachPacing } from './workspace-volumes/volume-detach.ts';

/** Marks a Server partition whose purge started; it is the last file the purge removes. */
export const pendingPurgeMarker = 'pending-purge';

interface PurgeVolumes {
    disk?: WorkspaceDisk | null;
    pacing?: DetachPacing;
}

/**
 * The Server deleted itself: stop this attachment's sessions and sandbox processes the
 * way shutdown does, so a forced volume detach is only a backstop, then purge.
 */
export async function deleteServerPartition(
    work: { close(): Promise<void>; writerSnapshot(): Promise<unknown>[] },
    partition: PurgeVolumes & { dataRoot: string; serverId: string }
): Promise<void> {
    await work.close().catch((error: unknown) => {
        console.error(`Server work did not drain cleanly before deletion: ${message(error)}`);
    });
    await purgeServerPartition({ ...partition, pendingWriters: work.writerSnapshot() });
}

/**
 * Removes one Server's Computer-local partition and its workspace reservations. The
 * pending-purge marker outlives every other file, so a purge that fails or is killed
 * midway replays at the next attachment start instead of stranding volumes.
 */
export async function purgeServerPartition(
    input: PurgeVolumes & {
        dataRoot: string;
        pendingWriters?: Iterable<Promise<unknown>>;
        serverId: string;
    }
): Promise<void> {
    if (!isServerId(input.serverId)) {
        throw new Error('Invalid Server id.');
    }
    await Promise.allSettled([...(input.pendingWriters ?? [])]);
    const partitionRoot = join(input.dataRoot, 'servers', input.serverId);
    if (await markPendingPurge(partitionRoot)) {
        // Never recurse into a mounted workspace; its reservation goes once the partition does.
        const stuck = await detachServerWorkspaces({ ...input, onBusy: 'force' });
        if (stuck.length > 0) {
            throw new Error(
                `Server partition kept: ${stuck.length} workspace volume(s) are still mounted.`
            );
        }
        await removePartition(partitionRoot);
    }
    await releaseVacantReservations(input.dataRoot);
}

/**
 * Attachment start: finishes every Server purge that a crash or a failed detach left
 * behind. A marker whose purging process is still alive belongs to a purge in progress.
 */
export async function replayPendingServerPurges(
    input: PurgeVolumes & { dataRoot: string }
): Promise<string[]> {
    const replayed: string[] = [];
    for (const serverId of await listDirectories(join(input.dataRoot, 'servers'))) {
        if (!isServerId(serverId)) {
            continue;
        }
        const owner = await readPurgeOwner(
            join(input.dataRoot, 'servers', serverId, pendingPurgeMarker)
        );
        if (owner === null || purgeInProgress(owner)) {
            continue;
        }
        try {
            await purgeServerPartition({ ...input, serverId });
            replayed.push(serverId);
            console.warn(`Finished the interrupted purge of deleted Server ${serverId}.`);
        } catch (error) {
            console.error(`Deleted Server ${serverId} is still not purged: ${message(error)}`);
        }
    }
    return replayed;
}

async function markPendingPurge(partitionRoot: string): Promise<boolean> {
    try {
        await writeFile(join(partitionRoot, pendingPurgeMarker), `${process.pid}\n`, {
            mode: 0o600,
        });
        return true;
    } catch (error) {
        if (isMissing(error)) {
            return false;
        }
        throw error;
    }
}

async function removePartition(partitionRoot: string) {
    for (const entry of await readdir(partitionRoot)) {
        if (entry !== pendingPurgeMarker) {
            await rm(join(partitionRoot, entry), { force: true, recursive: true });
        }
    }
    await rm(partitionRoot, { force: true, recursive: true });
}

/** The purging pid, `0` when unreadable (an owner that died mid-write), or null. */
async function readPurgeOwner(marker: string): Promise<number | null> {
    try {
        const owner = Number.parseInt(await readFile(marker, 'utf8'), 10);
        return Number.isSafeInteger(owner) && owner > 0 ? owner : 0;
    } catch (error) {
        if (isMissing(error)) {
            return null;
        }
        throw error;
    }
}

function purgeInProgress(owner: number) {
    return owner > 0 && owner !== process.pid && processExists(owner);
}

function isServerId(serverId: string) {
    return /^srv_[A-Za-z0-9_-]{16}$/u.test(serverId);
}

function message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
