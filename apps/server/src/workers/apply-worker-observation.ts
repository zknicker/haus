import {
    advanceWorkerTurn,
    type WorkerObservation,
    type WorkerTurnNotice,
    type WorkerTurnStall,
    type WorkerTurnStep,
    type WorkerStallCode,
    type WorkerTurnStatus,
    type Worker,
    type WorkerLifecycle,
    isTerminalWorkerTurnStatus,
    projectWorker,
} from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, workerTurnsTable, workersTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';
import { seedPullRequestReadings } from './pull-request-readings.ts';
import { isLiveChat, noticeDedupeKey } from './worker-attention.ts';
import { prepareWorkerEvents } from './worker-events.ts';
import { findWorker } from './worker-shape.ts';

type RecordedRunStep = Extract<WorkerTurnStep, { kind: 'recorded' }>;

export interface AppliedWorkerObservation {
    /** One `worker.updated` per linking Message in a live Chat. */
    events: PreparedRealtimeEvent[];
    /** The delegating Agent to wake, set only when a settled Run notified it. */
    wake: { agentId: string; serverId: string } | null;
    work: Worker;
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
export async function applyWorkerObservation(
    db: HausDatabase,
    input: { computerId: string; observation: WorkerObservation; serverId: string },
    agentDelivery: AgentDelivery
): Promise<AppliedWorkerObservation | null> {
    const { observation } = input;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({
                agentId: workersTable.agentId,
                branches: workerTurnsTable.branches,
                cancelRequestedAt: workerTurnsTable.cancelRequestedAt,
                chatId: workersTable.chatId,
                computerId: workersTable.computerId,
                observedAt: workerTurnsTable.observedAt,
                runStartedAt: workerTurnsTable.startedAt,
                runStatus: workerTurnsTable.status,
                stallCode: workerTurnsTable.stallCode,
                stallSince: workerTurnsTable.stallSince,
                workStatus: workersTable.status,
            })
            .from(workerTurnsTable)
            .innerJoin(
                workersTable,
                and(
                    eq(workersTable.serverId, workerTurnsTable.serverId),
                    eq(workersTable.id, workerTurnsTable.workId)
                )
            )
            .where(
                and(
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.id, observation.runId),
                    eq(workerTurnsTable.workId, observation.workId)
                )
            )
            .limit(1);
        if (!row || row.computerId !== input.computerId) {
            return null;
        }
        const observedAt = new Date(observation.observedAt);
        const step = advanceWorkerTurn(
            {
                cancelRequested: row.cancelRequestedAt !== null,
                observedAt: row.observedAt,
                stall: storedStall(row),
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
            .update(workerTurnsTable)
            .set(runObservationUpdate(observation, lifecycle, step, row.branches))
            .where(
                and(
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.id, observation.runId)
                )
            );

        await seedPullRequestReadings(tx, {
            branches: observation.branches ?? [],
            now: observedAt,
            serverId: input.serverId,
        });

        const [latestRun] = await tx
            .select({ id: workerTurnsTable.id })
            .from(workerTurnsTable)
            .where(
                and(
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.workId, observation.workId)
                )
            )
            .orderBy(desc(workerTurnsTable.createdAt))
            .limit(1);
        // An older Run still reports while a follow-up waits behind it. It never
        // projects lifecycle, but it is news: without this the job reads as quiet.
        await tx
            .update(workersTable)
            .set(
                latestRun?.id === observation.runId
                    ? workObservationUpdate(observation, projectWorker(lifecycle))
                    : {
                          updatedAt: sql`greatest(${workersTable.updatedAt}, ${observation.observedAt}::timestamptz)`,
                      }
            )
            .where(
                and(
                    eq(workersTable.serverId, input.serverId),
                    eq(workersTable.id, observation.workId)
                )
            );

        if (step.settled) {
            await deleteQueuedStallNotices(tx, input.serverId, observation.runId);
        }
        // The notice goes to the Chat that asked for the work, never to a later
        // link (ADR 0044). If that Chat is gone, the work settles (or keeps
        // retrying) silently.
        const notice = await deliverableNotice(tx, step, {
            chatId: row.chatId,
            serverId: input.serverId,
        });
        if (notice) {
            await agentDelivery.enqueue(tx, {
                agentId: row.agentId,
                chatId: row.chatId,
                workerNotice: notice.kind,
                workerTurnId: observation.runId,
                content: '',
                dedupeKey: noticeDedupeKey(observation.runId, notice, step.stall),
                serverId: input.serverId,
                source: 'cloud_agent_work',
            });
        }

        const work = await findWorker(tx, input.serverId, observation.workId);
        if (!work) {
            throw new Error('The Worker could not be projected after an observation.');
        }
        return {
            events: await prepareWorkerEvents(tx, {
                serverId: input.serverId,
                workId: observation.workId,
            }),
            wake: notice ? { agentId: row.agentId, serverId: input.serverId } : null,
            work,
        };
    });
}

function runObservationUpdate(
    observation: WorkerObservation,
    lifecycle: WorkerLifecycle,
    step: RecordedRunStep,
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
        report: observation.report ?? null,
        summary: observation.summary ?? null,
        ...(observation.usage ? { usage: observation.usage } : {}),
    };
}

function workObservationUpdate(observation: WorkerObservation, lifecycle: WorkerLifecycle) {
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

function storedStall(row: {
    stallCode: WorkerStallCode | null;
    stallSince: Date | null;
}): WorkerTurnStall | null {
    return row.stallCode && row.stallSince ? { code: row.stallCode, since: row.stallSince } : null;
}

/** A notice needs a live Chat to land in; without one the Run moves on silently. */
async function deliverableNotice(
    db: HausDatabase,
    step: RecordedRunStep,
    chat: { chatId: string; serverId: string }
): Promise<WorkerTurnNotice | null> {
    return step.notice && (await isLiveChat(db, chat)) ? step.notice : null;
}

/** One outcome replaces every stall reminder the Agent has not read yet. */
async function deleteQueuedStallNotices(db: HausDatabase, serverId: string, runId: string) {
    await db
        .delete(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, serverId),
                eq(agentInboxTable.workerTurnId, runId),
                eq(agentInboxTable.workerNotice, 'stall'),
                eq(agentInboxTable.state, 'queued')
            )
        );
}

/** The Run's lifecycle fields once `status` is recorded; the earliest start stands. */
function runLifecycle(
    status: WorkerTurnStatus,
    observation: WorkerObservation,
    previousStart: Date | null
): WorkerLifecycle {
    const observedAt = new Date(observation.observedAt);
    const reportedStart = observation.startedAt ? new Date(observation.startedAt) : observedAt;
    const startedAt =
        status !== 'queued' && (!previousStart || reportedStart < previousStart)
            ? reportedStart
            : previousStart;
    return {
        startedAt,
        status,
        terminalAt: isTerminalWorkerTurnStatus(status) ? observedAt : null,
    };
}
