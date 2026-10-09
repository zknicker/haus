import {
    type CloudAgentObservation,
    type CloudAgentWork,
    isTerminalCloudAgentStatus,
    type ServerDurableEvent,
} from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import {
    type CloudAgentEventChat,
    insertCloudAgentWorkEvent,
    readCloudAgentEventAnchor,
} from './cloud-agent-events.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';

export interface AppliedCloudAgentObservation {
    event: ServerDurableEvent;
    /** The delegating Agent to wake, set only when a Run just settled. */
    wake: { agentId: string; serverId: string } | null;
    work: CloudAgentWork;
}

/**
 * Applies one bounded Computer observation to its Run and work. A duplicate,
 * out-of-order, or post-terminal observation is a no-op: the first terminal
 * result a Run reports is the one that stands. Only the newest Run projects
 * work lifecycle. Every settling Run creates one durable inbox attention for the
 * delegating Agent, in the same transaction.
 */
export async function applyCloudAgentObservation(
    db: HausDatabase,
    input: { computerId: string; observation: CloudAgentObservation; serverId: string },
    agentDelivery: AgentDelivery
): Promise<AppliedCloudAgentObservation | null> {
    const { observation } = input;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({
                agentId: cloudAgentWorkTable.agentId,
                branches: cloudAgentRunsTable.branches,
                chatId: cloudAgentWorkTable.chatId,
                computerId: cloudAgentWorkTable.computerId,
                messageId: cloudAgentWorkTable.messageId,
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
        const observedAt = new Date(observation.observedAt);
        if (row.terminalAt || (row.observedAt && row.observedAt >= observedAt)) {
            return null;
        }

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

        if (settling) {
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
            event: await emitWorkEvent(tx, {
                chatId: row.chatId,
                messageId: row.messageId,
                serverId: input.serverId,
                workId: observation.workId,
            }),
            wake: settling ? { agentId: row.agentId, serverId: input.serverId } : null,
            work,
        };
    });
}

export async function emitWorkEvent(
    db: HausDatabase,
    input: { chatId: string; messageId: string; serverId: string; workId: string }
): Promise<ServerDurableEvent> {
    const anchor: { chat: CloudAgentEventChat; sequence: number } = await readCloudAgentEventAnchor(
        db,
        input
    );
    return await insertCloudAgentWorkEvent(db, {
        chat: anchor.chat,
        chatId: input.chatId,
        cloudAgentWorkId: input.workId,
        messageId: input.messageId,
        sequence: anchor.sequence,
        serverId: input.serverId,
    });
}

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
