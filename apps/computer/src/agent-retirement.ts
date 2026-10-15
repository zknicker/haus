import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentRetireCommand } from '@haus/api';
import { detachMountsUnder } from './workspace-volumes/computer-volumes.ts';
import type { WorkspaceDisk } from './workspace-volumes/disk-image.ts';
import { releaseWorkspace, withStorageLock } from './workspace-volumes/storage-ledger.ts';
import type { DetachPacing } from './workspace-volumes/volume-detach.ts';
import {
    detachAgentWorkspace,
    exists,
    workspaceVolumePaths,
} from './workspace-volumes/workspace-volume.ts';

export function parseAgentRetireCommand(frame: unknown): AgentRetireCommand | null {
    if (
        !isRecord(frame) ||
        frame.type !== 'agent-retire' ||
        typeof frame.agentId !== 'string' ||
        !/^agt_[A-Za-z0-9_-]{16}$/u.test(frame.agentId)
    ) {
        return null;
    }
    return { agentId: frame.agentId, type: 'agent-retire' };
}

/**
 * Idempotently erases exactly one retired Agent's Computer-local partition. The
 * workspace reservation is released only after its volume detached and the partition
 * is gone; a volume that cannot detach rejects and keeps both, and the Server's
 * retirement tombstone replays the purge on the next connection.
 */
export async function purgeRetiredAgent(input: {
    agentId: string;
    dataRoot: string;
    disk?: WorkspaceDisk | null;
    pacing?: DetachPacing;
    serverId: string;
}): Promise<void> {
    if (!/^agt_[A-Za-z0-9_-]{16}$/u.test(input.agentId)) {
        throw new Error('Invalid Agent id.');
    }
    if (!/^srv_[A-Za-z0-9_-]{16}$/u.test(input.serverId)) {
        throw new Error('Invalid Server id.');
    }
    const agentRoot = join(input.dataRoot, 'servers', input.serverId, 'agents', input.agentId);
    const volume = {
        ...(input.disk === undefined ? {} : { disk: input.disk }),
        ...(input.pacing ? { pacing: input.pacing } : {}),
    };
    // Holder waits and detach retries run unlocked; the lock guards only the ledger.
    if (await exists(workspaceVolumePaths(agentRoot).manifest)) {
        // A retired Agent's processes are stopped; force only if one still holds the volume.
        await detachAgentWorkspace({ agentRoot, onBusy: 'force', ...volume });
    } else if (await exists(workspaceVolumePaths(agentRoot).image)) {
        throw new Error('Workspace image is unverified; recover it before retirement.');
    }
    // Never recurse into a mount, including one an interrupted create left without a manifest.
    const stuck = await detachMountsUnder({ dataRoot: input.dataRoot, root: agentRoot, ...volume });
    if (stuck.length > 0) {
        throw new Error(`Agent partition kept: ${stuck.join(', ')} is still mounted.`);
    }
    await rm(agentRoot, { force: true, recursive: true });
    // Also releases a reservation an earlier replay leaked after its rm succeeded.
    await withStorageLock(input.dataRoot, () => releaseWorkspace(input.dataRoot, agentRoot));
}

/** Names the stuck retirement instead of the generic state-report failure. */
export function reportRetirementError(agentId: string, error: unknown) {
    console.error(
        `Agent ${agentId} retirement did not finish; its partition and workspace reservation remain until the Server replays retirement: ${error instanceof Error ? error.message : error}`
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
