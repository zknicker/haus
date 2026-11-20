import type { WorkerReportDraft, WorkerReportInput, WorkerReportReceipt } from '@haus/api';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    serverMembershipsTable,
    taskFollowsTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { readTask } from '../tasks/task-read.ts';
import { WorkerClosedError } from './errors.ts';
import { WorkerPersonUnknownError, WorkerTurnSettledError } from './place-errors.ts';
import type { WorkerCredentialScope } from './worker-credentials.ts';
import { resolveWorkerPerson } from './worker-person.ts';

export async function recordWorkerReport(
    db: HausDatabase,
    scope: Pick<WorkerCredentialScope, 'serverId' | 'turnId' | 'workerId'>,
    input: WorkerReportInput
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, scope.serverId);
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
                    eq(workerTurnsTable.serverId, scope.serverId),
                    eq(workerTurnsTable.id, scope.turnId),
                    eq(workerTurnsTable.workerId, scope.workerId)
                )
            )
            .limit(1);
        if (!row || row.turn.outcome) {
            throw new WorkerTurnSettledError();
        }
        const { turn, worker } = row;
        if (worker.closingAt || worker.closedAt || !worker.taskId) {
            throw new WorkerClosedError();
        }
        const task = await readTask(tx, worker.serverId, worker.taskId);
        const taskChatId = task.chatId ?? '';
        const resolved = await resolveWorkerPerson(tx, {
            handle: input.person,
            serverId: worker.serverId,
            taskChatId,
        });
        if (resolved.personRefused) {
            throw new WorkerPersonUnknownError(
                resolved.personRefused,
                await readFollowerHandles(tx, worker.serverId, taskChatId)
            );
        }
        const draft = {
            ask: input.ask,
            outcome: input.outcome,
            personId: resolved.person?.id ?? null,
            pullRequestUrls: input.pullRequestUrls,
            text: input.text,
        } satisfies WorkerReportDraft;
        await tx
            .update(workerTurnsTable)
            .set({ reportDraft: draft })
            .where(
                and(eq(workerTurnsTable.serverId, turn.serverId), eq(workerTurnsTable.id, turn.id))
            );
        return { draft, turnId: turn.id } satisfies WorkerReportReceipt;
    });
}

async function readFollowerHandles(tx: HausDatabase, serverId: string, taskChatId: string) {
    const rows = await tx
        .select({ handle: serverMembershipsTable.handle })
        .from(taskFollowsTable)
        .innerJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, taskFollowsTable.serverId),
                eq(serverMembershipsTable.userId, taskFollowsTable.userId)
            )
        )
        .where(
            and(
                eq(taskFollowsTable.serverId, serverId),
                eq(taskFollowsTable.taskChatId, taskChatId),
                eq(taskFollowsTable.followed, true),
                isNull(serverMembershipsTable.revokedAt),
                isNotNull(serverMembershipsTable.handle)
            )
        )
        .orderBy(serverMembershipsTable.handle);
    return rows.flatMap((row) => (row.handle ? [row.handle] : []));
}
