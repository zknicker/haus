import { and, eq, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, captainChatMembersTable, chatsTable } from '../postgres/schema.ts';

type Reader = Pick<HausDatabase, 'select'>;

export class RetiredCaptainChatSendError extends Error {
    constructor() {
        super('This Captain is retired. You can read its chat, but you can’t send new messages.');
        this.name = 'RetiredCaptainChatSendError';
    }
}

export async function requireCaptainChatId(
    db: Reader,
    input: { agentId: string; serverId: string }
) {
    const chatId = await readCaptainChatId(db, input);
    if (!chatId) {
        throw new Error(`Captain ${input.agentId} has no Captain chat.`);
    }
    return chatId;
}

export async function readCaptainChatId(db: Reader, input: { agentId: string; serverId: string }) {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.kind, 'captain'),
                eq(chatsTable.captainAgentId, input.agentId)
            )
        )
        .limit(1);
    return chat?.id ?? null;
}

export async function requireActiveCaptain(
    db: Reader,
    chat: { captainAgentId: string | null; kind: string; serverId: string }
) {
    if (chat.kind !== 'captain' || !chat.captainAgentId) {
        return;
    }
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, chat.serverId),
                eq(agentsTable.id, chat.captainAgentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    if (!agent) {
        throw new RetiredCaptainChatSendError();
    }
}

export async function joinCaptainChat(
    tx: Pick<HausDatabase, 'insert'>,
    input: { chatId: string; serverId: string; userId: string }
) {
    await tx
        .insert(captainChatMembersTable)
        .values({ ...input, subscribed: true })
        .onConflictDoUpdate({
            set: { subscribed: true, updatedAt: sql`now()` },
            target: [
                captainChatMembersTable.serverId,
                captainChatMembersTable.chatId,
                captainChatMembersTable.userId,
            ],
        });
}

export async function setCaptainChatMembership(
    tx: Pick<HausDatabase, 'delete' | 'insert'>,
    input: {
        chatId: string;
        member?: boolean | undefined;
        serverId: string;
        subscribed?: boolean | undefined;
        userId: string;
    }
) {
    const key = and(
        eq(captainChatMembersTable.serverId, input.serverId),
        eq(captainChatMembersTable.chatId, input.chatId),
        eq(captainChatMembersTable.userId, input.userId)
    );
    if (input.member === false) {
        await tx.delete(captainChatMembersTable).where(key);
        return { member: false, subscribed: false };
    }
    const subscribed = input.subscribed ?? true;
    await tx
        .insert(captainChatMembersTable)
        .values({
            chatId: input.chatId,
            serverId: input.serverId,
            subscribed,
            userId: input.userId,
        })
        .onConflictDoUpdate({
            set: {
                ...(input.subscribed === undefined ? {} : { subscribed }),
                updatedAt: sql`now()`,
            },
            target: [
                captainChatMembersTable.serverId,
                captainChatMembersTable.chatId,
                captainChatMembersTable.userId,
            ],
        });
    return { member: true, subscribed };
}

export async function readCaptainChatSubscribers(
    db: Reader,
    input: { chatId: string; serverId: string }
) {
    const rows = await db
        .select({ userId: captainChatMembersTable.userId })
        .from(captainChatMembersTable)
        .where(
            and(
                eq(captainChatMembersTable.serverId, input.serverId),
                eq(captainChatMembersTable.chatId, input.chatId),
                eq(captainChatMembersTable.subscribed, true)
            )
        );
    return rows.map((row) => row.userId);
}
