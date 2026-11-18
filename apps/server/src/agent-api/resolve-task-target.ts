import { parseTaskKey, TASK_TARGET_PATTERN } from '@haus/api';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    channelAgentParticipantsTable,
    chatsTable,
    taskKeysTable,
    tasksTable,
} from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

/** The Task key a `task:SEC-12` target names, or null when it is not one. */
export function parseTaskTarget(target: string): string | null {
    return TASK_TARGET_PATTERN.exec(target)?.[1] ?? null;
}

/**
 * The Chat of the Task a `task:SEC-12` target names (ADR 0053), when the Agent
 * has joined the Channel the Task started in; null otherwise. A Task's key is
 * its ledger entry's key and its number, unique per Server.
 */
export async function resolveTaskTargetChat(
    db: Reader,
    runner: Pick<ResolvedRunner, 'agentId' | 'serverId'>,
    taskKey: string
): Promise<{ chatId: string; taskId: string } | null> {
    const parsed = parseTaskKey(taskKey);
    if (!parsed) {
        return null;
    }
    const rows = await db
        .select({ chatId: tasksTable.chatId, taskId: tasksTable.id })
        .from(tasksTable)
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, tasksTable.serverId),
                eq(taskKeysTable.id, tasksTable.keyId)
            )
        )
        .innerJoin(
            chatsTable,
            and(eq(chatsTable.serverId, tasksTable.serverId), eq(chatsTable.id, tasksTable.chatId))
        )
        .innerJoin(
            channelAgentParticipantsTable,
            and(
                eq(channelAgentParticipantsTable.serverId, chatsTable.serverId),
                eq(channelAgentParticipantsTable.chatId, chatsTable.parentChatId),
                eq(channelAgentParticipantsTable.agentId, runner.agentId)
            )
        )
        .where(
            and(
                eq(tasksTable.serverId, runner.serverId),
                eq(tasksTable.number, parsed.number),
                eq(taskKeysTable.key, parsed.boardKey),
                isNotNull(tasksTable.chatId),
                eq(chatsTable.kind, 'task')
            )
        )
        .limit(1);
    const [row] = rows;
    return row?.chatId ? { chatId: row.chatId, taskId: row.taskId } : null;
}
