import { AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH, type AgentTurnTrigger } from '@haus/api';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachmentsTable, chatMessagesTable } from '../postgres/schema.ts';
import {
    type AgentTurnTriggerPreviews,
    type AgentTurnTriggerRecord,
    agentTurnTrigger,
    agentTurnTriggerMessageRef,
    agentTurnTriggerRunIds,
    previewHead,
} from './agent-turn-trigger.ts';
import { readAgentTurnOutcomes } from './agent-turn-trigger-outcomes.ts';

/**
 * Names each record's trigger, quoting the waking messages in one read and
 * reading what heartbeat and dream runs came to in a few more, none per run.
 * Only visible triggers are quoted, so a Chat the reader cannot see never leaks
 * text; the caller must already have gated `visible` by Chat visibility. A
 * heartbeat's `postedChatId` is limited to Chats `userId` can see.
 */
export async function resolveAgentTurnTriggers(
    db: HausDatabase,
    input: { serverId: string; userId: string },
    records: readonly (AgentTurnTriggerRecord | null)[]
): Promise<(AgentTurnTrigger | null)[]> {
    const { serverId, userId } = input;
    const [previews, outcomes] = await Promise.all([
        readTriggerPreviews(
            db,
            serverId,
            records.map(agentTurnTriggerMessageRef).filter((ref) => ref !== null)
        ),
        readAgentTurnOutcomes(db, { ...agentTurnTriggerRunIds(records), serverId, userId }),
    ]);
    return records.map((record) => agentTurnTrigger(record, previews, outcomes));
}

async function readTriggerPreviews(
    db: HausDatabase,
    serverId: string,
    refs: readonly { chatId: string; messageId: string }[]
): Promise<AgentTurnTriggerPreviews> {
    const chatOf = new Map(refs.map((ref) => [ref.messageId, ref.chatId]));
    if (chatOf.size === 0) {
        return new Map();
    }
    const rows = await db
        .select({
            attachmentCount: sql<number>`(
                select ${count()}::int from ${attachmentsTable}
                where ${attachmentsTable.serverId} = ${chatMessagesTable.serverId}
                    and ${attachmentsTable.messageId} = ${chatMessagesTable.id}
            )`,
            chatId: chatMessagesTable.chatId,
            content: sql<string>`left(${chatMessagesTable.content}, ${AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH})`,
            id: chatMessagesTable.id,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                inArray(chatMessagesTable.id, [...chatOf.keys()])
            )
        );
    return new Map(
        rows
            // A message quotes only under the Chat its trigger names.
            .filter((row) => chatOf.get(row.id) === row.chatId)
            .map((row) => [
                row.id,
                { attachmentCount: Number(row.attachmentCount), content: previewHead(row.content) },
            ])
    );
}
