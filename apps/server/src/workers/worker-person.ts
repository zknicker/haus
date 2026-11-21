import type { WorkerTurnInput } from '@haus/api';
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

export async function resolveAskingPerson(
    db: Pick<HausDatabase, 'select'>,
    input: { input: WorkerTurnInput[] | null; serverId: string; taskChatId: string | null }
) {
    const newest = (input.input ?? []).filter((entry) => entry.author.kind === 'user').at(-1);
    if (!(newest && input.taskChatId)) {
        return null;
    }
    const [member] = await db
        .select({ handle: serverMembershipsTable.handle, id: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, input.serverId),
                eq(serverMembershipsTable.userId, newest.author.id),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(1);
    if (!member?.handle) {
        return null;
    }
    const reader = await canReadChat(db, {
        chatId: input.taskChatId,
        serverId: input.serverId,
        userId: member.id,
    });
    return reader ? ({ handle: member.handle, id: member.id } satisfies WorkerPerson) : null;
}
