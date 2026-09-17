import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable, chatMessagesTable, messageTasksTable } from '../postgres/schema.ts';

/** Remove only ambient queued delivery for one inline reply chain. */
export async function deleteQueuedInlineReplyItems(
    db: Pick<HausDatabase, 'delete'>,
    input: { agentId: string; chatId: string; rootMessageId: string; serverId: string }
): Promise<void> {
    await db.delete(agentInboxTable).where(
        and(
            queuedFor(input.agentId),
            eq(agentInboxTable.serverId, input.serverId),
            eq(agentInboxTable.chatId, input.chatId),
            eq(agentInboxTable.mentioned, false),
            sql`exists (
                    select 1 from ${chatMessagesTable} message
                    where message.server_id = ${agentInboxTable.serverId}
                      and message.id = ${agentInboxTable.dedupeKey}
                      and message.chat_id = ${input.chatId}
                      and message.reply_to_message_id is not null
                      and coalesce(message.reply_root_message_id, message.id) = ${input.rootMessageId}
                )`,
            sql`not exists (
                    select 1 from ${messageTasksTable} task
                    where task.server_id = ${agentInboxTable.serverId}
                      and task.message_id = ${agentInboxTable.dedupeKey}
                      and task.assignee_agent_id = ${agentInboxTable.agentId}
                )`
        )
    );
}

function queuedFor(agentId: string) {
    return and(
        eq(agentInboxTable.agentId, agentId),
        eq(agentInboxTable.state, 'queued'),
        isNull(agentInboxTable.runId)
    );
}
