import { and, asc, eq, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import type { EnqueueInput } from '../src/agent-delivery/enqueue-input.ts';
import type { HausDatabase } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { chatMessagesTable, chatsTable, serverMembershipsTable } from '../src/postgres/schema.ts';

export async function deliverHumanMessage(
    db: HausDatabase,
    delivery: Pick<AgentDelivery, 'deliver'>,
    input: EnqueueInput
) {
    if ((input.source ?? 'human') === 'human' && input.chatId) {
        await seedHumanMessage(db, { ...input, chatId: input.chatId });
    }
    await delivery.deliver(input);
}

export async function seedHumanMessage(
    db: HausDatabase,
    input: { chatId: string; content: string; dedupeKey: string; serverId: string }
) {
    const [author] = await db
        .select({ userId: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(eq(serverMembershipsTable.serverId, input.serverId))
        .orderBy(asc(serverMembershipsTable.joinedAt))
        .limit(1);
    if (!author) {
        throw new Error(`Server ${input.serverId} has no member to author a message.`);
    }
    const [existing] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, input.dedupeKey))
        .limit(1);
    if (existing) {
        return;
    }
    const [chat] = await db
        .update(chatsTable)
        .set({ lastMessageSequence: sql`${chatsTable.lastMessageSequence} + 1` })
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)))
        .returning({ sequence: chatsTable.lastMessageSequence });
    if (!chat) {
        throw new Error(`Chat ${input.chatId} is gone.`);
    }
    await db.insert(chatMessagesTable).values({
        authorUserId: author.userId,
        chatId: input.chatId,
        content: input.content,
        id: input.dedupeKey,
        nonce: createOpaqueId('nonce'),
        sequence: chat.sequence,
        serverId: input.serverId,
    });
}
