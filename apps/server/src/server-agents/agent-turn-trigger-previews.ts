import { AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH, type AgentTurnTrigger } from '@haus/api';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { attachmentsTable, chatMessagesTable } from '../postgres/schema.ts';
import {
    type AgentTurnTriggerPreviews,
    type AgentTurnTriggerRecord,
    agentTurnTrigger,
    agentTurnTriggerMessageRef,
} from './agent-turn-trigger.ts';

/**
 * Names each record's trigger, quoting the waking messages in one read. Only
 * visible triggers are quoted, so a Chat the reader cannot see never leaks
 * text; the caller must already have gated `visible` by Chat visibility.
 */
export async function resolveAgentTurnTriggers(
    db: HausDatabase,
    serverId: string,
    records: readonly (AgentTurnTriggerRecord | null)[]
): Promise<(AgentTurnTrigger | null)[]> {
    const previews = await readTriggerPreviews(
        db,
        serverId,
        records.map(agentTurnTriggerMessageRef).filter((ref) => ref !== null)
    );
    return records.map((record) => agentTurnTrigger(record, previews));
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

/**
 * The contract bounds UTF-16 units while Postgres `left` counts characters, so
 * the head is cut again here without splitting a surrogate pair.
 */
export function previewHead(content: string): string {
    if (content.length <= AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH) {
        return content;
    }
    const head = content.slice(0, AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH);
    return highSurrogateAtEnd.test(head) ? head.slice(0, -1) : head;
}

const highSurrogateAtEnd = /[\uD800-\uDBFF]$/u;
