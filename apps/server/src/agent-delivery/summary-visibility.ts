import type { AgentTurnSummary } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { recordExactMessagesServed } from './cursors.ts';
import * as store from './store.ts';

/**
 * Applies a settling run's reported visible messages: each identity that still
 * names its message exactly is recorded as served, and the queued rows it
 * matches attach to the run so settlement can mark them seen.
 */
export async function attachSummaryVisibility(
    db: HausDatabase,
    state: store.AgentDeliveryRow,
    identities: AgentTurnSummary['visibleMessages'] | undefined
) {
    if (!(state.activeRunId && identities && identities.length > 0)) {
        return;
    }
    const rows = await store.listInboxItemsByDedupeKeys(db, {
        agentId: state.agentId,
        dedupeKeys: identities.map((identity) => identity.id),
        runId: state.activeRunId,
    });
    const byMessageId = new Map(rows.map((row) => [row.dedupeKey, row]));
    const messages = await db
        .select({
            chatId: chatMessagesTable.chatId,
            id: chatMessagesTable.id,
            sequence: chatMessagesTable.sequence,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, state.serverId),
                inArray(
                    chatMessagesTable.id,
                    identities.map((identity) => identity.id)
                )
            )
        );
    const messageById = new Map(messages.map((message) => [message.id, message]));
    const attachableIds: string[] = [];
    const visibleMessages: Array<{ chatId: string; id: string }> = [];
    for (const identity of identities) {
        const row = byMessageId.get(identity.id);
        const message = messageById.get(identity.id);
        if (message?.sequence !== identity.sequence || message.chatId !== identity.chatId) {
            continue;
        }
        visibleMessages.push({ chatId: message.chatId, id: message.id });
        if (row?.chatId === identity.chatId) {
            attachableIds.push(row.id);
        }
    }
    await store.attachQueuedItemsToRun(db, {
        agentId: state.agentId,
        itemIds: attachableIds,
        runId: state.activeRunId,
    });
    await recordExactMessagesServed(db, {
        agentId: state.agentId,
        messages: visibleMessages,
        runId: state.activeRunId,
        serverId: state.serverId,
    });
}
