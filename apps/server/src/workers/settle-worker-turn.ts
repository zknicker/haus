import {
    type WorkerFailure,
    type WorkerObservation,
    type WorkerOutcome,
    type WorkerQuestions,
    parseGithubPullRequestUrl,
    workerOutcomeOf,
} from '@haus/api';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { InboxWork } from '../agent-delivery/inbox-work.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentInboxTable,
    taskPullRequestsTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { readTask } from '../tasks/task-read.ts';
import { isLiveChat } from './worker-attention.ts';
import { revokeTurnCredentials } from './worker-credentials.ts';
import { resolveAskingPerson, resolveWorkerPerson } from './worker-person.ts';
import { questionDraft } from './worker-question-draft.ts';
import { postWorkerReportMessage, workerReportContent } from './worker-report-message.ts';

type WorkerRow = typeof workersTable.$inferSelect;
type SettledStatus = Exclude<WorkerObservation['status'], 'queued' | 'running'>;

export async function settleWorkerTurn(
    tx: HausDatabase,
    agentDelivery: AgentDelivery,
    input: {
        observation: Pick<WorkerObservation, 'errorCode' | 'questions' | 'result' | 'turnId'>;
        status: SettledStatus;
        worker: WorkerRow;
    }
) {
    const { observation, worker } = input;
    const task = worker.taskId ? await readTask(tx, worker.serverId, worker.taskId) : null;
    const taskChatId = task?.chatId ?? null;
    const { messageId, person, recorded } = await recordedOutcome(tx, { ...input, taskChatId });
    await recordOutcome(tx, { outcome: recorded, turnId: observation.turnId, worker });
    const events: PreparedRealtimeEvent[] = [];
    const wakes: Array<{ agentId: string; serverId: string }> = [];
    if (recorded.kind === 'report' && messageId && taskChatId && task) {
        const message = await postWorkerReportMessage(tx, agentDelivery, {
            agentId: worker.agentId,
            chatId: taskChatId,
            content: workerReportContent(recorded.report, person),
            messageId,
            serverId: worker.serverId,
            turnId: observation.turnId,
        });
        events.push(message.event);
        wakes.push(...message.wakes);
    }
    if (recorded.kind === 'report' && task) {
        await attachReportedPullRequests(tx, {
            serverId: worker.serverId,
            taskId: task.id,
            urls: recorded.report.pullRequestUrls,
        });
    }
    const delivered = await queueWorkerReport(tx, agentDelivery, {
        outcome: recorded,
        taskChatId,
        turnId: observation.turnId,
        worker,
    });
    await closeWhenSettled(tx, worker);
    return { events, wakes: delivered ? [...wakes, delivered] : wakes };
}

export async function settleWorkerTurnAsFailed(
    tx: HausDatabase,
    agentDelivery: InboxWork,
    input: { detail?: string; reason: WorkerFailure; turnId: string; worker: WorkerRow }
) {
    const { worker } = input;
    const outcome: WorkerOutcome = {
        detail: input.detail ?? null,
        kind: 'failed',
        reason: input.reason,
    };
    await recordOutcome(tx, { outcome, turnId: input.turnId, worker });
    const task = worker.taskId ? await readTask(tx, worker.serverId, worker.taskId) : null;
    const delivered = await queueWorkerReport(tx, agentDelivery, {
        outcome,
        taskChatId: task?.chatId ?? null,
        turnId: input.turnId,
        worker,
    });
    await closeWhenSettled(tx, worker);
    return delivered;
}

export async function queueWorkerReport(
    tx: HausDatabase,
    agentDelivery: InboxWork,
    input: {
        outcome: WorkerOutcome;
        taskChatId: string | null;
        turnId: string;
        worker: WorkerRow;
    }
) {
    const { outcome, taskChatId, worker } = input;
    if (outcome.kind === 'stopped' && !worker.closingAt) {
        return null;
    }
    if (outcome.kind === 'report' && outcome.report.questions && outcome.report.personId) {
        return null;
    }
    if (
        !(taskChatId && (await isLiveChat(tx, { chatId: taskChatId, serverId: worker.serverId })))
    ) {
        return null;
    }
    await agentDelivery.enqueue(tx, {
        agentId: worker.agentId,
        chatId: taskChatId,
        content: '',
        dedupeKey: `worker-report:${input.turnId}`,
        serverId: worker.serverId,
        source: 'worker_report',
        workerTurnId: input.turnId,
    });
    return { agentId: worker.agentId, serverId: worker.serverId };
}

export async function closeWhenSettled(tx: HausDatabase, worker: WorkerRow) {
    if (!worker.closingAt || worker.closedAt) {
        return;
    }
    await tx
        .update(workersTable)
        .set({ closedAt: sql`now()`, updatedAt: sql`now()` })
        .where(
            and(
                eq(workersTable.serverId, worker.serverId),
                eq(workersTable.id, worker.id),
                isNull(workersTable.closedAt),
                sql`not exists (
                    select 1 from worker_turns live
                    where live.server_id = ${worker.serverId}
                        and live.worker_id = ${worker.id}
                        and live.outcome is null
                )`
            )
        );
}

async function recordedOutcome(
    tx: HausDatabase,
    input: {
        observation: Pick<WorkerObservation, 'errorCode' | 'questions' | 'result' | 'turnId'>;
        status: SettledStatus;
        taskChatId: string | null;
        worker: WorkerRow;
    }
) {
    const { observation, taskChatId } = input;
    if (input.status === 'pending_input' && observation.questions) {
        return await questionOutcome(tx, { ...input, questions: observation.questions });
    }
    const resolved = taskChatId
        ? await resolveWorkerPerson(tx, {
              handle: observation.result?.personHandle ?? null,
              serverId: input.worker.serverId,
              taskChatId,
          })
        : { person: null, personRefused: null };
    const outcome = workerOutcomeOf({
        errorCode: observation.errorCode ?? null,
        messageId: null,
        person: { personId: resolved.person?.id ?? null, personRefused: resolved.personRefused },
        result: observation.result ?? null,
        status: input.status,
    });
    const posted = outcome.kind === 'report' && outcome.report.text && taskChatId;
    const messageId = posted ? createOpaqueId('msg') : null;
    const recorded: WorkerOutcome =
        outcome.kind === 'report'
            ? { ...outcome, report: { ...outcome.report, messageId } }
            : outcome;
    return { messageId, person: resolved.person, recorded };
}

export async function recordOutcome(
    tx: HausDatabase,
    input: { outcome: WorkerOutcome; turnId: string; worker: WorkerRow }
) {
    const { worker } = input;
    await revokeTurnCredentials(tx, worker.serverId, [input.turnId]);
    await tx
        .update(workerTurnsTable)
        .set({ outcome: input.outcome, stallCode: null, stallSince: null })
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                eq(workerTurnsTable.id, input.turnId)
            )
        );
    await tx
        .delete(agentInboxTable)
        .where(
            and(
                eq(agentInboxTable.serverId, worker.serverId),
                eq(agentInboxTable.workerTurnId, input.turnId),
                eq(agentInboxTable.source, 'worker_stall'),
                eq(agentInboxTable.state, 'queued')
            )
        );
}

export async function attachReportedPullRequests(
    tx: HausDatabase,
    input: { serverId: string; taskId: string; urls: readonly string[] }
) {
    const keys = input.urls.flatMap((url) => {
        const key = parseGithubPullRequestUrl(url);
        return key ? [key] : [];
    });
    if (keys.length === 0) {
        return;
    }
    await tx
        .insert(taskPullRequestsTable)
        .values(keys.map((key) => ({ ...key, serverId: input.serverId, taskId: input.taskId })))
        .onConflictDoNothing();
}

async function questionOutcome(
    tx: HausDatabase,
    input: {
        observation: Pick<WorkerObservation, 'turnId'>;
        questions: WorkerQuestions;
        taskChatId: string | null;
        worker: WorkerRow;
    }
) {
    const { worker } = input;
    const [turn] = await tx
        .select({ input: workerTurnsTable.input, reportDraft: workerTurnsTable.reportDraft })
        .from(workerTurnsTable)
        .where(
            and(
                eq(workerTurnsTable.serverId, worker.serverId),
                eq(workerTurnsTable.id, input.observation.turnId)
            )
        )
        .limit(1);
    const draft = await questionDraft(tx, {
        questions: input.questions,
        turn: turn ?? { input: null, reportDraft: null },
        worker,
    });
    const messageId = input.taskChatId ? createOpaqueId('msg') : null;
    const recorded: WorkerOutcome = {
        kind: 'report',
        report: { ...draft, messageId, personRefused: null, source: 'provider' },
    };
    const person = draft.personId
        ? await resolveAskingPerson(tx, {
              input: turn?.input ?? null,
              serverId: worker.serverId,
              taskChatId: input.taskChatId,
          })
        : null;
    return { messageId, person, recorded };
}
