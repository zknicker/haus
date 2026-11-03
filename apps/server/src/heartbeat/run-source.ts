import { and, eq } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentRunTriggersTable } from '../postgres/schema.ts';

const heartbeatSources = new Set(['dream', 'heartbeat']);

/** Whether the calling run is a heartbeat run, daytime (`heartbeat`) or nightly (`dream`). */
export async function isHeartbeatRun(
    db: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'runId' | 'serverId'>
): Promise<boolean> {
    const source = await readRunSource(db, runner);
    return source !== null && heartbeatSources.has(source);
}

/**
 * Whether the calling run still holds the Agent's run slot. Call inside the Server
 * lock: a yielded or stopped run clears the slot, and must not write afterwards.
 */
export async function isActiveRun(
    tx: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'runId' | 'serverId'>
): Promise<boolean> {
    const [row] = await tx
        .select({ activeRunId: agentDeliveryTable.activeRunId })
        .from(agentDeliveryTable)
        .where(
            and(
                eq(agentDeliveryTable.serverId, runner.serverId),
                eq(agentDeliveryTable.agentId, runner.agentId)
            )
        )
        .limit(1);
    return row?.activeRunId === runner.runId;
}

/** The inbox source that started the calling run, or null when the Server recorded none. */
export async function readRunSource(
    db: HausDatabase,
    runner: Pick<ResolvedRunner, 'agentId' | 'runId' | 'serverId'>
): Promise<string | null> {
    const [row] = await db
        .select({ source: agentRunTriggersTable.source })
        .from(agentRunTriggersTable)
        .where(
            and(
                eq(agentRunTriggersTable.serverId, runner.serverId),
                eq(agentRunTriggersTable.agentId, runner.agentId),
                eq(agentRunTriggersTable.runId, runner.runId)
            )
        )
        .limit(1);
    return row?.source ?? null;
}
