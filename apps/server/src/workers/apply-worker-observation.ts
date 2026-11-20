import {
    type WorkerLifecycle,
    type WorkerObservation,
    type WorkerStallCode,
    type WorkerTurnStall,
    type WorkerTurnStatus,
    type WorkerTurnStep,
    advanceWorkerTurn,
    isTerminalWorkerTurnStatus,
    projectWorker,
} from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, tasksTable, workerTurnsTable, workersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { mergeBranchEvidence } from './merge-branch-evidence.ts';
import { seedPullRequestReadings } from './pull-request-readings.ts';
import { settleWorkerTurn } from './settle-worker-turn.ts';
import { isLiveChat, noticeDedupeKey } from './worker-attention.ts';
import type { WorkerEffects } from './worker-effects.ts';

type RecordedTurnStep = Extract<WorkerTurnStep, { kind: 'recorded' }>;
type SettledStatus = Exclude<WorkerTurnStatus, 'queued' | 'running'>;

const providerAcceptedStatuses: ReadonlySet<WorkerTurnStatus> = new Set([
    'running',
    'pending_input',
    'completed',
]);

/**
 * Applies one bounded carrier observation to its turn and Worker. A duplicate,
 * out-of-order, or post-terminal observation is a no-op: the first terminal
 * result a turn reports stands. Only the newest turn projects the Worker's
 * provider lifecycle. The first settled reading of a turn Haus has not
 * settled yet settles it (`settleWorkerTurn`); a turn Haus already settled as
 * stopped records the provider's reading and nothing else. A live turn that
 * reports a stall queues one `worker_stall` item per reminder window.
 */
export async function applyWorkerObservation(
    db: HausDatabase,
    input: { computerId: string; observation: WorkerObservation; serverId: string },
    agentDelivery: AgentDelivery,
    storage: ArtifactStorage | null
): Promise<WorkerEffects | null> {
    const { observation } = input;
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [row] = await tx
            .select({ turn: workerTurnsTable, worker: workersTable })
            .from(workerTurnsTable)
            .innerJoin(
                workersTable,
                and(
                    eq(workersTable.serverId, workerTurnsTable.serverId),
                    eq(workersTable.id, workerTurnsTable.workerId)
                )
            )
            .where(
                and(
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.id, observation.turnId),
                    eq(workerTurnsTable.workerId, observation.workerId)
                )
            )
            .limit(1);
        if (!row || row.worker.carrierComputerId !== input.computerId) {
            return null;
        }
        const { turn, worker } = row;
        const observedAt = new Date(observation.observedAt);
        const step = advanceWorkerTurn(
            {
                cancelRequested: turn.stopRequestedAt !== null,
                observedAt: turn.observedAt,
                stall: storedStall(turn),
                status: turn.status,
                workStatus: worker.status,
            },
            { observedAt, stallCode: observation.stallCode ?? null, status: observation.status }
        );
        if (step.kind === 'ignored') {
            return null;
        }
        const settledByHaus = turn.outcome !== null;
        const lifecycle = turnLifecycle(step.status, observation, turn.startedAt);
        await tx
            .update(workerTurnsTable)
            .set(turnObservationUpdate(observation, lifecycle, step, turn.branches, settledByHaus))
            .where(
                and(
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.id, observation.turnId)
                )
            );
        await seedPullRequestReadings(tx, {
            branches: observation.branches ?? [],
            now: observedAt,
            serverId: input.serverId,
        });
        const [newest] = await tx
            .select({ id: workerTurnsTable.id })
            .from(workerTurnsTable)
            .where(
                and(
                    eq(workerTurnsTable.serverId, input.serverId),
                    eq(workerTurnsTable.workerId, observation.workerId)
                )
            )
            .orderBy(desc(workerTurnsTable.createdAt), desc(workerTurnsTable.id))
            .limit(1);
        await tx
            .update(workersTable)
            .set(
                newest?.id === observation.turnId
                    ? workerObservationUpdate(observation, projectWorker(lifecycle))
                    : {
                          updatedAt: sql`greatest(${workersTable.updatedAt}, ${observation.observedAt}::timestamptz)`,
                      }
            )
            .where(
                and(
                    eq(workersTable.serverId, input.serverId),
                    eq(workersTable.id, observation.workerId)
                )
            );
        if (
            turn.status === 'queued' &&
            turn.workerMdRevisionId &&
            providerAcceptedStatuses.has(step.status)
        ) {
            await tx
                .update(workersTable)
                .set({ workerMdRevisionId: turn.workerMdRevisionId })
                .where(
                    and(eq(workersTable.serverId, input.serverId), eq(workersTable.id, worker.id))
                );
        }
        const effects: WorkerEffects = { events: [], frames: [], wakes: [] };
        if (step.settled && !settledByHaus) {
            await deleteQueuedStallNotices(tx, input.serverId, observation.turnId);
            const settled = await settleWorkerTurn(tx, agentDelivery, {
                observation,
                status: step.status as SettledStatus,
                worker,
            });
            effects.events.push(...settled.events);
            effects.wakes.push(...settled.wakes);
        }
        if (!(step.settled || settledByHaus) && step.notice?.kind === 'stall') {
            const queued = await queueStallNotice(tx, agentDelivery, {
                dedupeKey: noticeDedupeKey(observation.turnId, step.notice, step.stall),
                turnId: observation.turnId,
                worker,
            });
            if (queued) {
                effects.wakes.push(queued);
            }
        }
        return await withDispatch(tx, storage, input.serverId, {
            ...effects,
            workerIds: [worker.id],
        });
    });
}

async function queueStallNotice(
    tx: HausDatabase,
    agentDelivery: AgentDelivery,
    input: { dedupeKey: string; turnId: string; worker: typeof workersTable.$inferSelect }
) {
    const { worker } = input;
    const chatId = worker.taskId ? await taskChatIdOf(tx, worker) : null;
    if (!(chatId && (await isLiveChat(tx, { chatId, serverId: worker.serverId })))) {
        return null;
    }
    await agentDelivery.enqueue(tx, {
        agentId: worker.agentId,
        chatId,
        content: '',
        dedupeKey: input.dedupeKey,
        serverId: worker.serverId,
        source: 'worker_stall',
        workerTurnId: input.turnId,
    });
    return { agentId: worker.agentId, serverId: worker.serverId };
}

async function taskChatIdOf(tx: HausDatabase, worker: typeof workersTable.$inferSelect) {
    const [task] = await tx
        .select({ chatId: tasksTable.chatId })
        .from(tasksTable)
        .where(
            and(eq(tasksTable.serverId, worker.serverId), eq(tasksTable.id, worker.taskId ?? ''))
        )
        .limit(1);
    return task?.chatId ?? null;
}

function turnObservationUpdate(
    observation: WorkerObservation,
    lifecycle: WorkerLifecycle,
    step: RecordedTurnStep,
    previousBranches: Parameters<typeof mergeBranchEvidence>[0],
    settledByHaus: boolean
) {
    return {
        ...lifecycle,
        ...(observation.branches
            ? { branches: mergeBranchEvidence(previousBranches, observation.branches) }
            : {}),
        // Always written, never merely spread: a stall must clear once it resolves.
        errorCode: step.settled ? (observation.errorCode ?? null) : null,
        observedAt: new Date(observation.observedAt),
        ...(observation.providerRunId ? { providerRunId: observation.providerRunId } : {}),
        ...(observation.rawStatus ? { rawStatus: observation.rawStatus } : {}),
        stallCode: settledByHaus ? null : (step.stall?.code ?? null),
        stallSince: settledByHaus ? null : (step.stall?.since ?? null),
        providerResult: observation.report ?? null,
        summary: observation.summary ?? null,
        ...(observation.usage ? { usage: observation.usage } : {}),
    };
}

function workerObservationUpdate(observation: WorkerObservation, lifecycle: WorkerLifecycle) {
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

async function deleteQueuedStallNotices(tx: HausDatabase, serverId: string, turnId: string) {
    await tx
        .delete(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, serverId),
                eq(agentInboxTable.workerTurnId, turnId),
                eq(agentInboxTable.source, 'worker_stall'),
                eq(agentInboxTable.state, 'queued')
            )
        );
}

function turnLifecycle(
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
