import type { ActiveWorkerLocation } from '@haus/api';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, workerHistoryLinksTable } from '../postgres/schema.ts';
import { linkChatVisibleSql, linkParentChatsTable } from './worker-visibility.ts';

/** One link the viewer can read, with the Chat facts "Happening now" names. */
export interface VisibleWorkLink {
    chatDmMemberOneUserId: string | null;
    chatDmMemberTwoUserId: string | null;
    chatId: string;
    chatKind: 'channel' | 'dm' | 'task';
    chatName: string | null;
    messageId: string;
    parentChatId: string | null;
    parentDmMemberOneUserId: string | null;
    parentDmMemberTwoUserId: string | null;
    parentKind: 'channel' | 'dm' | 'task' | null;
    parentName: string | null;
    workerId: string;
}

/** Where one row opens and the link it opens on. */
export interface ChosenWorkLocation {
    link: VisibleWorkLink;
    location: ActiveWorkerLocation;
}

/** Every visible link of these works, newest first (`created_at`, then id). */
export async function readVisibleWorkLinks(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; userId: string; workerIds: string[] }
): Promise<VisibleWorkLink[]> {
    if (input.workerIds.length === 0) {
        return [];
    }
    return await db
        .select({
            chatDmMemberOneUserId: chatsTable.dmMemberOneUserId,
            chatDmMemberTwoUserId: chatsTable.dmMemberTwoUserId,
            chatId: workerHistoryLinksTable.chatId,
            chatKind: chatsTable.kind,
            chatName: chatsTable.name,
            messageId: workerHistoryLinksTable.messageId,
            parentChatId: chatsTable.parentChatId,
            parentDmMemberOneUserId: linkParentChatsTable.dmMemberOneUserId,
            parentDmMemberTwoUserId: linkParentChatsTable.dmMemberTwoUserId,
            parentKind: linkParentChatsTable.kind,
            parentName: linkParentChatsTable.name,
            workerId: workerHistoryLinksTable.workerId,
        })
        .from(workerHistoryLinksTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, workerHistoryLinksTable.serverId),
                eq(chatsTable.id, workerHistoryLinksTable.chatId)
            )
        )
        .leftJoin(
            linkParentChatsTable,
            and(
                eq(linkParentChatsTable.serverId, chatsTable.serverId),
                eq(linkParentChatsTable.id, chatsTable.parentChatId)
            )
        )
        .where(
            and(
                eq(workerHistoryLinksTable.serverId, input.serverId),
                inArray(workerHistoryLinksTable.workerId, input.workerIds),
                linkChatVisibleSql(input.serverId, { kind: 'user', userId: input.userId })
            )
        )
        .orderBy(desc(workerHistoryLinksTable.createdAt), desc(workerHistoryLinksTable.messageId));
}

export function chooseWorkLocation(
    launchMessageId: string | null,
    links: VisibleWorkLink[]
): ChosenWorkLocation | null {
    const link = links.find((candidate) => candidate.messageId === launchMessageId) ?? links[0];
    if (!link) {
        return null;
    }
    return {
        link,
        location: { chatId: link.chatId, kind: 'message', messageId: link.messageId },
    };
}

export function conversationChatIdOf(link: VisibleWorkLink): string {
    return link.chatId;
}
