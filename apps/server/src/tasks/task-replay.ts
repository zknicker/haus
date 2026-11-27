import {
    TASK_REPLAY_MAX_CHARS,
    TASK_REPLAY_MESSAGES,
    type TaskReplay,
    type TaskReplayMessage,
} from '@haus/api';
import { and, asc, desc, eq, gt, lt } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    serverMembershipsTable,
    tasksTable,
} from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function readTaskReplay(
    db: Reader,
    input: { agentId: string; before: number | undefined; serverId: string }
) {
    const [task] = await db
        .select({ chatId: tasksTable.chatId })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, input.serverId), eq(tasksTable.agentId, input.agentId)))
        .limit(1);
    if (!task?.chatId) {
        return null;
    }
    const inChat = and(
        eq(chatMessagesTable.serverId, input.serverId),
        eq(chatMessagesTable.chatId, task.chatId)
    );
    const [first] = await selectMessages(db)
        .where(inChat)
        .orderBy(asc(chatMessagesTable.sequence))
        .limit(1);
    const brief =
        first && (input.before === undefined || first.sequence < input.before) ? first : null;
    if (!brief) {
        const empty: TaskReplay = { brief: null, messages: [] };
        return empty;
    }
    const newest = await selectMessages(db)
        .where(
            and(
                inChat,
                gt(chatMessagesTable.sequence, brief.sequence),
                input.before === undefined
                    ? undefined
                    : lt(chatMessagesTable.sequence, input.before)
            )
        )
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(TASK_REPLAY_MESSAGES);
    const replay: TaskReplay = {
        brief: toReplayMessage(brief),
        messages: [...newest].reverse().map(toReplayMessage),
    };
    return replay;
}

function selectMessages(db: Reader) {
    return db
        .select({
            agentHandle: agentsTable.handle,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            humanHandle: serverMembershipsTable.handle,
            id: chatMessagesTable.id,
            sequence: chatMessagesTable.sequence,
        })
        .from(chatMessagesTable)
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, chatMessagesTable.serverId),
                eq(agentsTable.id, chatMessagesTable.authorAgentId)
            )
        )
        .leftJoin(
            serverMembershipsTable,
            and(
                eq(serverMembershipsTable.serverId, chatMessagesTable.serverId),
                eq(serverMembershipsTable.userId, chatMessagesTable.authorUserId)
            )
        )
        .$dynamic();
}

function toReplayMessage(row: {
    agentHandle: string | null;
    content: string;
    createdAt: Date;
    humanHandle: string | null;
    id: string;
    sequence: number;
}) {
    const message: TaskReplayMessage = {
        author: row.agentHandle ?? row.humanHandle ?? 'haus',
        body: row.content.slice(0, TASK_REPLAY_MAX_CHARS),
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        sequence: row.sequence,
    };
    return message;
}
