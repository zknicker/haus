import type { TaskActor } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentTaskFollowsTable, chatsTable, tasksTable } from '../postgres/schema.ts';
import { creatorColumns } from './task-actor.ts';
import { insertTaskAgent } from './task-agent.ts';
import { TaskInvariantError } from './task-errors.ts';
import { seedTaskFollowers } from './task-follows.ts';
import type { TaskSessionChoice } from './task-session-choice.ts';
import { mintTaskShortId } from './task-short-id.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export interface StartedTaskRecord {
    agentId: string;
    chatId: string;
    shortId: string;
    taskId: string;
}

export async function insertStartedTask(
    tx: Tx,
    input: {
        captainId: string | null;
        origin: { chatId: string; messageId: string } | null;
        projectId: string;
        repo?: { name: string; ref: string | null } | null;
        requestId: string | null;
        serverId: string;
        session: TaskSessionChoice;
        starter: TaskActor;
        title: string;
        titleCustom: boolean;
    }
) {
    const { serverId } = input;
    const chatId = createOpaqueId('cht');
    await tx.insert(chatsTable).values({
        id: chatId,
        kind: 'task',
        parentChatId: input.projectId,
        parentChatKind: 'channel',
        serverId,
    });
    const shortId = await mintTaskShortId(tx, serverId);
    const agentId = await insertTaskAgent(tx, { ...input, shortId });
    const taskId = createOpaqueId('tsk');
    await tx.insert(tasksTable).values({
        ...creatorColumns(input.starter),
        agentId,
        captainId: input.captainId,
        chatId,
        computerId: input.session.computerId,
        id: taskId,
        model: input.session.modelId,
        originChatId: input.origin?.chatId ?? null,
        originMessageId: input.origin?.messageId ?? null,
        projectId: input.projectId,
        repo: input.repo?.name ?? null,
        repoRef: input.repo?.ref ?? null,
        serverId,
        shortId,
        startRequestId: input.requestId,
        title: input.title,
        titleCustom: input.titleCustom,
    });
    await seedTaskFollowers(tx, {
        chatId,
        origin: input.origin,
        projectId: input.projectId,
        serverId,
        starter: input.captainId === null ? input.starter : null,
    });
    const record: StartedTaskRecord = { agentId, chatId, shortId, taskId };
    return record;
}

export async function readStartedByRequest(
    db: Pick<HausDatabase, 'select'>,
    input: { requestId?: string | undefined; serverId: string; starter: TaskActor }
) {
    if (input.requestId === undefined) {
        return null;
    }
    const starter = creatorColumns(input.starter);
    const [task] = await db
        .select({
            createdByAgentId: tasksTable.createdByAgentId,
            createdByUserId: tasksTable.createdByUserId,
            id: tasksTable.id,
        })
        .from(tasksTable)
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.startRequestId, input.requestId)
            )
        )
        .limit(1);
    if (!task) {
        return null;
    }
    if (
        task.createdByAgentId !== starter.createdByAgentId ||
        task.createdByUserId !== starter.createdByUserId
    ) {
        throw new TaskInvariantError('That request id already started someone else’s Task.');
    }
    return task.id;
}

export async function unfollowAsCaptain(
    tx: Pick<HausDatabase, 'update'>,
    input: { captainId: string; chatId: string; serverId: string }
) {
    await tx
        .update(agentTaskFollowsTable)
        .set({ followed: false, updatedAt: sql`now()` })
        .where(
            and(
                eq(agentTaskFollowsTable.serverId, input.serverId),
                eq(agentTaskFollowsTable.agentId, input.captainId),
                eq(agentTaskFollowsTable.taskChatId, input.chatId)
            )
        );
}
