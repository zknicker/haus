import type { ActiveCloudAgentWorkLocation } from '@haus/api';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, cloudAgentWorkLinksTable } from '../postgres/schema.ts';
import { linkChatVisibleSql, linkParentChatsTable } from './cloud-agent-work-visibility.ts';

/** One link the viewer can read, with the Chat facts "Happening now" names. */
export interface VisibleWorkLink {
    chatAnchorMessageId: string | null;
    chatDmMemberOneUserId: string | null;
    chatDmMemberTwoUserId: string | null;
    chatId: string;
    chatKind: 'channel' | 'dm' | 'thread';
    chatName: string | null;
    messageId: string;
    parentChatId: string | null;
    parentDmMemberOneUserId: string | null;
    parentDmMemberTwoUserId: string | null;
    parentKind: 'channel' | 'dm' | 'thread' | null;
    parentName: string | null;
    workId: string;
}

/** Where one row opens and the link it opens on. */
export interface ChosenWorkLocation {
    link: VisibleWorkLink;
    location: ActiveCloudAgentWorkLocation;
}

/** Every visible link of these works, newest first (`created_at`, then id). */
export async function readVisibleWorkLinks(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string; userId: string; workIds: string[] }
): Promise<VisibleWorkLink[]> {
    if (input.workIds.length === 0) {
        return [];
    }
    return await db
        .select({
            chatAnchorMessageId: chatsTable.anchorMessageId,
            chatDmMemberOneUserId: chatsTable.dmMemberOneUserId,
            chatDmMemberTwoUserId: chatsTable.dmMemberTwoUserId,
            chatId: cloudAgentWorkLinksTable.chatId,
            chatKind: chatsTable.kind,
            chatName: chatsTable.name,
            messageId: cloudAgentWorkLinksTable.messageId,
            parentChatId: chatsTable.parentChatId,
            parentDmMemberOneUserId: linkParentChatsTable.dmMemberOneUserId,
            parentDmMemberTwoUserId: linkParentChatsTable.dmMemberTwoUserId,
            parentKind: linkParentChatsTable.kind,
            parentName: linkParentChatsTable.name,
            workId: cloudAgentWorkLinksTable.workId,
        })
        .from(cloudAgentWorkLinksTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, cloudAgentWorkLinksTable.serverId),
                eq(chatsTable.id, cloudAgentWorkLinksTable.chatId)
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
                eq(cloudAgentWorkLinksTable.serverId, input.serverId),
                inArray(cloudAgentWorkLinksTable.workId, input.workIds),
                linkChatVisibleSql(input.serverId, { kind: 'user', userId: input.userId })
            )
        )
        .orderBy(
            desc(cloudAgentWorkLinksTable.createdAt),
            desc(cloudAgentWorkLinksTable.messageId)
        );
}

/** The live child Thread each of these Messages anchors, by anchor id. */
export async function readChildThreads(
    db: Pick<HausDatabase, 'select'>,
    input: { messageIds: string[]; serverId: string }
): Promise<Map<string, string>> {
    if (input.messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select({ anchorMessageId: chatsTable.anchorMessageId, id: chatsTable.id })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.kind, 'thread'),
                inArray(chatsTable.anchorMessageId, input.messageIds),
                isNull(chatsTable.deletedAt)
            )
        );
    return new Map(
        rows.flatMap((row) => (row.anchorMessageId ? [[row.anchorMessageId, row.id]] : []))
    );
}

/**
 * ADR 0044, Q4: the launch work Thread when the viewer can read it, otherwise
 * the newest visible link as a Message location (its Thread when it has one).
 * Opening a row never creates or follows a Thread. `links` is newest first.
 */
export function chooseWorkLocation(
    launchMessageId: string,
    links: VisibleWorkLink[],
    childThreads: ReadonlyMap<string, string>
): ChosenWorkLocation | null {
    const launch = links.find((link) => link.messageId === launchMessageId);
    if (launch) {
        const threadChatId =
            launch.chatKind === 'thread' ? launch.chatId : childThreads.get(launch.messageId);
        const anchorMessageId =
            launch.chatKind === 'thread' ? launch.chatAnchorMessageId : launch.messageId;
        if (threadChatId && anchorMessageId) {
            return {
                link: launch,
                location: { anchorMessageId, kind: 'work-thread', threadChatId },
            };
        }
    }
    const newest = links[0];
    if (!newest) {
        return null;
    }
    const inThread = newest.chatKind === 'thread';
    return {
        link: newest,
        location: {
            chatId: inThread ? conversationChatIdOf(newest) : newest.chatId,
            kind: 'message',
            messageId: newest.messageId,
            threadChatId: inThread ? newest.chatId : (childThreads.get(newest.messageId) ?? null),
        },
    };
}

/** The Channel or DM a link sits in, through its Thread when it has one. */
export function conversationChatIdOf(link: VisibleWorkLink): string {
    if (link.chatKind !== 'thread') {
        return link.chatId;
    }
    if (!link.parentChatId) {
        throw new Error(`Cloud Agent work link ${link.messageId} has no conversation Chat.`);
    }
    return link.parentChatId;
}
