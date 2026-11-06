import {
    advanceCloudAgentRun,
    type CloudAgentObservation,
    type CloudAgentRunStep,
    type CloudAgentStatus,
    type CloudAgentWork,
    type CloudAgentWorkLifecycle,
    isTerminalCloudAgentStatus,
    projectCloudAgentWork,
} from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, cloudAgentRunsTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isLiveChat, noticeDedupeKey } from './cloud-agent-attention.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';
import { seedPullRequestReadings } from './pull-request-readings.ts';

export interface AppliedCloudAgentObservation {
    /** One `cloudAgentWork.updated` per linking Message in a live Chat. */
    events: PreparedRealtimeEvent[];
    /** The delegating Agent to wake, set only when a settled Run notified it. */
    wake: { agentId: string; serverId: string } | null;
    work: CloudAgentWork;
}

/**
 * Applies one bounded Computer observation to its Run and work. A duplicate,
 * out-of-order, or post-terminal observation is a no-op: the first terminal
 * result a Run reports is the one that stands. Only the newest Run projects
 * work lifecycle. Every settling Run creates one durable inbox attention for
 * the delegating Agent in the requesting Chat, in the same transaction, unless
 * that Chat has since been deleted; a non-terminal Run whose errorCode still
 * needs one (see `isStalledErrorCode`) creates the same kind of attention
 * without settling, at most once per reminder window.
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
                cancelRequestedAt: cloudAgentRunsTable.cancelRequestedAt,
                chatId: cloudAgentWorkTable.chatId,
                computerId: cloudAgentWorkTable.computerId,
                observedAt: cloudAgentRunsTable.observedAt,
                runStartedAt: cloudAgentRunsTable.startedAt,
                runStatus: cloudAgentRunsTable.status,
                stallCode: cloudAgentRunsTable.stallCode,
                stallSince: cloudAgentRunsTable.stallSince,
                workStatus: cloudAgentWorkTable.status,
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
        const step = advanceCloudAgentRun(
            {
                cancelRequested: row.cancelRequestedAt !== null,
                observedAt: row.observedAt,
                stall:
                    row.stallCode && row.stallSince
                        ? { code: row.stallCode, since: row.stallSince }
                        : null,
                status: row.runStatus,
                workStatus: row.workStatus,
            },
            {
                observedAt,
                stallCode: observation.stallCode ?? null,
                status: observation.status,
            }
        );
        if (step.kind === 'ignored') {
            return null;
        }

        const lifecycle = runLifecycle(step.status, observation, row.runStartedAt);
        await tx
            .update(cloudAgentRunsTable)
            .set(runObservationUpdate(observation, lifecycle, step, row.branches))
            .where(
                and(
                    eq(cloudAgentRunsTable.serverId, input.serverId),
                    eq(cloudAgentRunsTable.id, observation.runId)
                )
            );

        await seedPullRequestReadings(tx, {
            branches: observation.branches ?? [],
            now: observedAt,
            serverId: input.serverId,
        });

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
                    ? workObservationUpdate(observation, projectCloudAgentWork(lifecycle))
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

        if (step.settled) {
            await deleteQueuedStallNotices(tx, input.serverId, observation.runId);
        }
        // The notice goes to the Chat that asked for the work, never to a later
        // link (ADR 0044). If that Chat is gone, the work settles (or keeps
        // retrying) silently.
        const notice =
            step.notice && (await isLiveChat(tx, { chatId: row.chatId, serverId: input.serverId }))
                ? step.notice
                : null;
        if (notice) {
            await agentDelivery.enqueue(tx, {
                agentId: row.agentId,
                chatId: row.chatId,
                cloudAgentNotice: notice.kind,
                cloudAgentRunId: observation.runId,
                content: '',
                dedupeKey: noticeDedupeKey(observation.runId, notice, step.stall),
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
            wake: notice ? { agentId: row.agentId, serverId: input.serverId } : null,
            work,
        };
    });
}

function runObservationUpdate(
    observation: CloudAgentObservation,
    lifecycle: CloudAgentWorkLifecycle,
    step: Extract<CloudAgentRunStep, { kind: 'recorded' }>,
    previousBranches: Parameters<typeof mergeBranchEvidence>[0]
) {
    const observedAt = new Date(observation.observedAt);
    return {
        ...lifecycle,
        ...(observation.branches
            ? { branches: mergeBranchEvidence(previousBranches, observation.branches) }
            : {}),
        // Always written, never merely spread: a stall and its summary must clear
        // once the follow-up resolves, not linger from an earlier tick.
        errorCode: step.settled ? (observation.errorCode ?? null) : null,
        observedAt,
        ...(observation.providerRunId ? { providerRunId: observation.providerRunId } : {}),
        ...(observation.rawStatus ? { rawStatus: observation.rawStatus } : {}),
        stallCode: step.stall?.code ?? null,
        stallSince: step.stall?.since ?? null,
        summary: observation.summary ?? null,
        ...(observation.usage ? { usage: observation.usage } : {}),
    };
}

function workObservationUpdate(
    observation: CloudAgentObservation,
    lifecycle: CloudAgentWorkLifecycle
) {
    return {
        ...lifecycle,
        ...(observation.activity
            ? {
                  activityAt: new Date(observation.activity.at),
                  activitySummary: observation.activity.summary,
              }
            : {}),
        ...(observation.environmentId ? { environmentId: observation.environmentId } : {}),
        ...(observation.environmentName ? { environmentName: observation.environmentName } : {}),
        ...(observation.providerAgentId ? { providerAgentId: observation.providerAgentId } : {}),
        ...(observation.providerUrl ? { providerUrl: observation.providerUrl } : {}),
        updatedAt: new Date(observation.observedAt),
    };
}

/** One outcome replaces every stall reminder the Agent has not read yet. */
async function deleteQueuedStallNotices(db: HausDatabase, serverId: string, runId: string) {
    await db
        .delete(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, serverId),
                eq(agentInboxTable.cloudAgentRunId, runId),
                eq(agentInboxTable.cloudAgentNotice, 'stall'),
                eq(agentInboxTable.state, 'queued')
            )
        );
}

/** The Run's lifecycle fields once `status` is recorded; the earliest start stands. */
function runLifecycle(
    status: CloudAgentStatus,
    observation: CloudAgentObservation,
    previousStart: Date | null
): CloudAgentWorkLifecycle {
    const observedAt = new Date(observation.observedAt);
    const reportedStart = observation.startedAt ? new Date(observation.startedAt) : observedAt;
    const startedAt =
        status !== 'queued' && (!previousStart || reportedStart < previousStart)
            ? reportedStart
            : previousStart;
    return {
        startedAt,
        status,
        terminalAt: isTerminalCloudAgentStatus(status) ? observedAt : null,
    };
}
