import type { Worker, Task, TaskActor, TaskDetail } from '@haus/api';
import { and, desc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentTaskFollowsTable,
    chatsTable,
    workersTable,
    taskPullRequestsTable,
} from '../postgres/schema.ts';
import { pullRequestKey, readPullRequestReadings } from '../workers/pull-request-readings.ts';
import { readWorkerDetails, toWorker } from '../workers/worker-shape.ts';
import { isTaskFollowed } from './task-follows.ts';
import { taskUnreadCount } from './task-unread.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function readTaskPlaceDetail(
    db: Reader,
    actor: TaskActor,
    task: Task
): Promise<Pick<TaskDetail, 'attachedWork' | 'followed' | 'pullRequests' | 'unreadCount'>> {
    return {
        attachedWork: await readAttachedWork(db, task),
        ...(await readViewerState(db, actor, task)),
        pullRequests: await readAttachedPullRequests(db, task),
    };
}

async function readAttachedWork(db: Reader, task: Task): Promise<Worker[]> {
    const rows = await db
        .select()
        .from(workersTable)
        .where(and(eq(workersTable.serverId, task.serverId), eq(workersTable.taskId, task.id)))
        .orderBy(desc(workersTable.createdAt), desc(workersTable.id));
    const details = await readWorkerDetails(
        db,
        task.serverId,
        rows.map((row) => row.id)
    );
    return rows.map((row) => toWorker(row, details.get(row.id)));
}

async function readAttachedPullRequests(db: Reader, task: Task) {
    const attached = await db
        .select({
            number: taskPullRequestsTable.number,
            repository: taskPullRequestsTable.repository,
        })
        .from(taskPullRequestsTable)
        .where(
            and(
                eq(taskPullRequestsTable.serverId, task.serverId),
                eq(taskPullRequestsTable.taskId, task.id)
            )
        )
        .orderBy(taskPullRequestsTable.createdAt);
    const readings = await readPullRequestReadings(db, task.serverId, attached);
    return attached.flatMap((key) => {
        const reading = readings.get(pullRequestKey(key));
        return reading ? [reading] : [];
    });
}

async function readViewerState(db: Reader, actor: TaskActor, task: Task) {
    const { chatId } = task;
    if (!chatId) {
        return { followed: false, unreadCount: 0 };
    }
    if (actor.kind === 'agent') {
        const [follow] = await db
            .select({ followed: agentTaskFollowsTable.followed })
            .from(agentTaskFollowsTable)
            .where(
                and(
                    eq(agentTaskFollowsTable.serverId, task.serverId),
                    eq(agentTaskFollowsTable.agentId, actor.agentId),
                    eq(agentTaskFollowsTable.taskChatId, chatId)
                )
            )
            .limit(1);
        return { followed: follow?.followed === true, unreadCount: 0 };
    }
    const followed = await isTaskFollowed(db, {
        chatId,
        serverId: task.serverId,
        userId: actor.userId,
    });
    const [chat] = await db
        .select({ unreadCount: taskUnreadCount(actor.userId) })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, task.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    return { followed, unreadCount: followed ? (chat?.unreadCount ?? 0) : 0 };
}
