import { and, eq, isNull, sql } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, serverMembershipsTable } from '../postgres/schema.ts';

export interface WorkerPerson {
    handle: string;
    id: string;
}

const nobody = { person: null, personRefused: null };

export async function resolveWorkerPerson(
    db: Pick<HausDatabase, 'select'>,
    input: { handle: string | null; serverId: string; taskChatId: string }
) {
    const handle = input.handle?.replace(/^@/u, '').toLowerCase() ?? '';
    if (!handle) {
        return nobody;
    }
    const [member] = await db
        .select({ handle: serverMembershipsTable.handle, id: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, input.serverId),
                eq(sql`lower(${serverMembershipsTable.handle})`, handle),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    const reader =
        member?.handle &&
        (await canReadChat(db, {
            chatId: input.taskChatId,
            serverId: input.serverId,
            userId: member.id,
        }));
    if (!(member?.handle && reader)) {
        return { person: null, personRefused: handle };
    }
    return { person: { handle: member.handle, id: member.id }, personRefused: null };
}

async function canReadChat(
    db: Pick<HausDatabase, 'select'>,
    input: { chatId: string; serverId: string; userId: string }
) {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                visibleChats(input.userId)
            )
        )
        .limit(1);
    return chat !== undefined;
}
