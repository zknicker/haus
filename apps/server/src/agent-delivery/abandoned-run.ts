import type { AgentCommand } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { clearInboxNotices, requeueInboxItemsForRun } from './store.ts';

export async function abandonsResentRun(
    db: HausDatabase,
    input: { agentId: string; frame: AgentCommand; serverId: string }
) {
    const { frame } = input;
    if (frame.type !== 'start') {
        return false;
    }
    if (frame.inboxDelivery === 'notice' && frame.inbox.length === 0 && !frame.greets) {
        return true;
    }
    if (!frame.chatId || (await chatExists(db, input.serverId, frame.chatId))) {
        return false;
    }
    const run = { agentId: input.agentId, runId: frame.runId };
    await requeueInboxItemsForRun(db, run);
    await clearInboxNotices(db, run);
    return true;
}

async function chatExists(db: HausDatabase, serverId: string, chatId: string) {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    return chat !== undefined;
}
