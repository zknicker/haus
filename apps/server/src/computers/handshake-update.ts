import type { ComputerUpdateProgress } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { computersTable } from '../postgres/schema.ts';

type Transaction = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

/**
 * Update columns a bootstrap handshake writes. A reconnect that repeats the stored snapshot keeps
 * its timestamp, so a Computer reconnecting in a loop still ages into the stall bounds.
 */
export async function handshakeUpdateColumns(
    tx: Transaction,
    computerId: string,
    update: ComputerUpdateProgress,
    connectedAt: Date
) {
    const columns = {
        updateActiveAgentCount: update.activeAgentCount,
        updateDetail: update.detail,
        updateDownloadedBytes: update.downloadedBytes,
        updateFailedPhase: update.failedPhase,
        updatePhase: update.phase,
        updateTargetVersion: update.targetVersion,
        updateTotalBytes: update.totalBytes,
    };
    const [stored] = await tx
        .select({ ...pickColumns(), updateUpdatedAt: computersTable.updateUpdatedAt })
        .from(computersTable)
        .where(eq(computersTable.id, computerId))
        .for('update');
    const unchanged =
        stored?.updateUpdatedAt &&
        (Object.keys(columns) as (keyof typeof columns)[]).every(
            (key) => stored[key] === columns[key]
        );
    return {
        ...columns,
        updateUpdatedAt: unchanged ? stored.updateUpdatedAt : connectedAt,
    };
}

function pickColumns() {
    return {
        updateActiveAgentCount: computersTable.updateActiveAgentCount,
        updateDetail: computersTable.updateDetail,
        updateDownloadedBytes: computersTable.updateDownloadedBytes,
        updateFailedPhase: computersTable.updateFailedPhase,
        updatePhase: computersTable.updatePhase,
        updateTargetVersion: computersTable.updateTargetVersion,
        updateTotalBytes: computersTable.updateTotalBytes,
    };
}
