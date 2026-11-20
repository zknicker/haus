import type { ActiveWorker } from '@haus/api';
import { and, asc, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatsTable,
    tasksTable,
    workerTurnsTable,
    workersTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { readTasks } from '../tasks/task-read.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readWorkerDetails, toWorker } from './worker-shape.ts';
import { workerVisibleSql } from './worker-visibility.ts';

const placeChats = alias(chatsTable, 'place_chat');

/** Every open Worker with a queued or working turn the viewer can see, oldest first. */
export async function listActiveWorker(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string }
): Promise<ActiveWorker[]> {
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        return [];
    }
    const rows = await db
        .select({
            agentName: agentsTable.displayName,
            place: {
                dmMemberOneUserId: placeChats.dmMemberOneUserId,
                dmMemberTwoUserId: placeChats.dmMemberTwoUserId,
                id: placeChats.id,
                kind: placeChats.kind,
                name: placeChats.name,
            },
            taskChatId: chatsTable.id,
            worker: workersTable,
        })
        .from(workersTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, workersTable.serverId),
                eq(agentsTable.id, workersTable.agentId)
            )
        )
        .innerJoin(
            tasksTable,
            and(
                eq(tasksTable.serverId, workersTable.serverId),
                eq(tasksTable.id, workersTable.taskId)
            )
        )
        .innerJoin(
            chatsTable,
            and(eq(chatsTable.serverId, tasksTable.serverId), eq(chatsTable.id, tasksTable.chatId))
        )
        .innerJoin(
            placeChats,
            and(
                eq(placeChats.serverId, chatsTable.serverId),
                eq(placeChats.id, chatsTable.parentChatId)
            )
        )
        .where(
            and(
                eq(workersTable.serverId, input.serverId),
                isNull(workersTable.closedAt),
                exists(
                    db
                        .select({ one: sql`1` })
                        .from(workerTurnsTable)
                        .where(
                            and(
                                eq(workerTurnsTable.serverId, workersTable.serverId),
                                eq(workerTurnsTable.workerId, workersTable.id),
                                isNull(workerTurnsTable.outcome)
                            )
                        )
                ),
                workerVisibleSql(db, input.serverId, { kind: 'user', userId: member.id })
            )
        )
        .orderBy(asc(workersTable.createdAt), asc(workersTable.id));
    const details = await readWorkerDetails(
        db,
        input.serverId,
        rows.map((row) => row.worker.id)
    );
    const tasks = await readTasks(db, {
        serverId: input.serverId,
        where: inArray(
            tasksTable.id,
            rows.flatMap((row) => (row.worker.taskId ? [row.worker.taskId] : []))
        ),
    });
    const keyByTask = new Map(tasks.map((task) => [task.id, task.key]));
    return rows.flatMap(({ agentName, place, taskChatId, worker }) => {
        const taskKey = worker.taskId ? keyByTask.get(worker.taskId) : undefined;
        if (!(worker.taskId && taskKey) || (place.kind !== 'channel' && place.kind !== 'dm')) {
            return [];
        }
        const peer =
            place.dmMemberOneUserId === member.id
                ? place.dmMemberTwoUserId
                : place.dmMemberOneUserId;
        return [
            {
                agentName,
                chatKind: place.kind,
                chatName: place.name,
                chatPeerUserId: place.kind === 'dm' ? peer : null,
                conversationChatId: place.id,
                location: { chatId: taskChatId, kind: 'task', taskId: worker.taskId },
                taskId: worker.taskId,
                taskKey,
                worker: toWorker(worker, details.get(worker.id)),
            } satisfies ActiveWorker,
        ];
    });
}
