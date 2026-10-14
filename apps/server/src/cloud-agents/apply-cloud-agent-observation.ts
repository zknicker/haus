import { type CloudAgentObservation, isTerminalCloudAgentStatus } from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { applyClaudeCancellation } from './apply-claude-cancellation.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import type { AppliedCloudAgentObservation } from './cloud-agent-observation-result.ts';
import { isCloudAgentRequestChatLive } from './cloud-agent-request-chat.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';
import { prepareClaudeObservation } from './merge-claude-launch-receipt.ts';
import { preserveCloudAgentInput } from './preserve-cloud-agent-input.ts';

/**
 * Applies one bounded Computer observation to its Run and work. A duplicate,
 * out-of-order, or post-terminal observation is a no-op: the first terminal
 * result a Run reports is the one that stands. Only the newest Run projects
 * work lifecycle. Every settling Run creates one durable inbox attention for the
 * delegating Agent in the requesting Chat, in the same transaction, unless
 * that Chat has since been deleted.
 */
export async function applyCloudAgentObservation(
    db: HausDatabase,
    input: { computerId: string; observation: CloudAgentObservation; serverId: string },
    agentDelivery: AgentDelivery
): Promise<AppliedCloudAgentObservation | null> {
    let observation = input.observation;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({
                agentId: cloudAgentWorkTable.agentId,
                branches: cloudAgentRunsTable.branches,
                chatId: cloudAgentWorkTable.chatId,
                computerId: cloudAgentWorkTable.computerId,
                provider: cloudAgentWorkTable.provider,
                providerAgentId: cloudAgentWorkTable.providerAgentId,
                providerUrl: cloudAgentWorkTable.providerUrl,
                providerRunId: cloudAgentRunsTable.providerRunId,
                status: cloudAgentRunsTable.status,
                cancelRequestedAt: cloudAgentWorkTable.cancelRequestedAt,
                observedAt: cloudAgentRunsTable.observedAt,
                runStartedAt: cloudAgentRunsTable.startedAt,
                terminalAt: cloudAgentRunsTable.terminalAt,
                workStartedAt: cloudAgentWorkTable.startedAt,
            })
            .from(cloudAgentRunsTable)
            .innerJoin(
                cloudAgentWorkTable,
                and(
                    eq(cloudAgentWorkTable.serverId, cloudAgentRunsTable.serverId),
                    eq(cloudAgentWorkTable.id, cloudAgentRunsTable.workId)
                )
            )
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.id, observation.runId),
                    eq(cloudAgentRunsTable.workId, observation.workId)
                )
            )
            .limit(1);
        if (!row || row.computerId !== input.computerId) {
            return null;
        }
        const prepared = await prepareClaudeObservation(
            tx,
            { ...row, id: observation.workId },
            observation
        );
        observation = prepared.observation;
        const cancellation = await applyClaudeCancellation(
            tx,
            { serverId: input.serverId, observation },
            row,
            agentDelivery
        );
        if (cancellation.handled) {
            return cancellation.result;
        }
        const observedAt = new Date(observation.observedAt);
        if (row.terminalAt || (row.observedAt && row.observedAt >= observedAt)) {
            return await metadataObservation(
                tx,
                input.serverId,
                observation.workId,
                prepared.receiptChanged
            );
        }
        const guarded = await preserveCloudAgentInput(tx, row.provider, observation);
        if (!guarded) {
            return null;
        }
        observation = guarded;

        const settling = isTerminalCloudAgentStatus(observation.status);
        await tx
            .update(cloudAgentRunsTable)
            .set(runObservationUpdate(observation, row.runStartedAt, row.branches))
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.id, observation.runId)
                )
            );

        const [latestRun] = await tx
            .select({ id: cloudAgentRunsTable.id })
            .from(cloudAgentRunsTable)
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.workId, observation.workId)
                )
            )
            .orderBy(desc(cloudAgentRunsTable.createdAt))
            .limit(1);
        // An older Run still reports while a follow-up waits behind it. It never
        // projects lifecycle, but it is news: without this the job reads as quiet.
        await tx
            .update(cloudAgentWorkTable)
            .set(
                latestRun?.id === observation.runId
                    ? workObservationUpdate(observation, row.workStartedAt)
                    : {
                          updatedAt: sql`greatest(${cloudAgentWorkTable.updatedAt}, ${observation.observedAt}::timestamptz)`,
                      }
            )
            .where(
                and(
                    eq(cloudAgentWorkTable.serverId, input.serverId),
                    eq(cloudAgentWorkTable.id, observation.workId)
                )
            );

        // The notice goes to the Chat that asked for the work, never to a later
        // link (ADR 0044). If that Chat is gone, the work settles silently.
        const notifying =
            settling &&
            (await isCloudAgentRequestChatLive(tx, {
                chatId: row.chatId,
                serverId: input.serverId,
            }));
        if (notifying) {
            await agentDelivery.enqueue(tx, {
                agentId: row.agentId,
                chatId: row.chatId,
                content: '',
                dedupeKey: observation.runId,
                serverId: input.serverId,
                source: 'cloud_agent_work',
            });
        }

        const work = await findCloudAgentWork(tx, input.serverId, observation.workId);
        if (!work) {
            throw new Error('The Cloud Agent work could not be projected after an observation.');
        }
        return {
            events: await prepareCloudAgentWorkEvents(tx, {
                serverId: input.serverId,
                workId: observation.workId,
            }),
            wake: notifying ? { agentId: row.agentId, serverId: input.serverId } : null,
            work,
        };
    });
}

async function metadataObservation(
    db: HausDatabase,
    serverId: string,
    workId: string,
    changed: boolean
): Promise<AppliedCloudAgentObservation | null> {
    if (!changed) {
        return null;
    }
    const work = await findCloudAgentWork(db, serverId, workId);
    if (!work) {
        throw new Error('The Cloud Agent work disappeared after its launch receipt.');
    }
    return {
        work,
        wake: null,
        events: await prepareCloudAgentWorkEvents(db, { serverId, workId }),
    };
}

/** A Chat that still exists and is not tombstoned, nor is its parent. */
function runObservationUpdate(
    observation: CloudAgentObservation,
    previousStart: Date | null,
    previousBranches: Parameters<typeof mergeBranchEvidence>[0]
) {
    const observedAt = new Date(observation.observedAt);
    return {
        ...observationTimes(observation, previousStart),
        ...(observation.branches
            ? { branches: mergeBranchEvidence(previousBranches, observation.branches) }
            : {}),
        ...(observation.errorCode ? { errorCode: observation.errorCode } : {}),
        observedAt,
        ...(observation.providerRunId ? { providerRunId: observation.providerRunId } : {}),
        ...(observation.rawStatus ? { rawStatus: observation.rawStatus } : {}),
        ...(observation.summary ? { summary: observation.summary } : {}),
        ...(observation.usage ? { usage: observation.usage } : {}),
    };
}

function workObservationUpdate(observation: CloudAgentObservation, previousStart: Date | null) {
    return {
        ...observationTimes(observation, previousStart),
        ...(observation.activity
            ? {
                  activityAt: new Date(observation.activity.at),
                  activitySummary: observation.activity.summary,
              }
            : {}),
        ...(observation.providerAgentId ? { providerAgentId: observation.providerAgentId } : {}),
        ...(observation.providerUrl ? { providerUrl: observation.providerUrl } : {}),
        updatedAt: new Date(observation.observedAt),
    };
}

function observationTimes(observation: CloudAgentObservation, previousStart: Date | null) {
    const observedAt = new Date(observation.observedAt);
    return {
        ...(observation.status !== 'queued' && !previousStart ? { startedAt: observedAt } : {}),
        status: observation.status,
        terminalAt: isTerminalCloudAgentStatus(observation.status) ? observedAt : null,
    };
}
