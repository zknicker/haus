import type { ClaimList, ClaimListItem } from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import { readMessageBodies } from '../chats/message-bodies.ts';
import { readChatMessageReactions } from '../chats/message-reactions.ts';
import { toChatMessage } from '../chats/message-shape.ts';
import { readLinkedImageGenerations } from '../image-generation/linked-image-generations.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { readMessageTaskLinks } from '../tasks/task-reference-links.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readLinkedWorker } from '../workers/linked-worker.ts';
import { projectMessageClaims } from './claim-shape.ts';

/**
 * The Board and List lens. Background claims are an Agent's own bookkeeping,
 * so they stay out of the default answer and are counted instead;
 * `includeBackground` widens the lens to everything.
 */
export async function listClaims(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId?: string; includeBackground: boolean; serverId: string }
): Promise<ClaimList> {
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        return { backgroundCount: 0, claims: [] };
    }
    const predicates = [eq(messageClaimsTable.serverId, input.serverId), visibleChats(member.id)];
    if (input.chatId) {
        predicates.push(eq(messageClaimsTable.chatId, input.chatId));
    }
    const rows = await db
        .select({
            chatKind: chatsTable.kind,
            chatName: chatsTable.name,
            chatPeerUserId: sql<string | null>`case
                when ${chatsTable.dmMemberOneUserId} = ${member.id}
                then ${chatsTable.dmMemberTwoUserId}
                else ${chatsTable.dmMemberOneUserId}
            end`,
            message: chatMessagesTable,
            claim: messageClaimsTable,
        })
        .from(messageClaimsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, messageClaimsTable.serverId),
                eq(chatsTable.id, messageClaimsTable.chatId)
            )
        )
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, messageClaimsTable.serverId),
                eq(chatMessagesTable.id, messageClaimsTable.messageId)
            )
        )
        .where(and(...predicates))
        .orderBy(desc(messageClaimsTable.updatedAt));

    const visible = rows.filter((row) => row.chatKind !== 'task');
    const messageIds = visible.map((row) => row.claim.messageId);
    const [projected, bodies, works, images, reactions, taskLinks] = await Promise.all([
        projectMessageClaims(
            db,
            input.serverId,
            visible.map((row) => row.claim)
        ),
        readMessageBodies(db, input.serverId, messageIds),
        readLinkedWorker(db, input.serverId, messageIds),
        readLinkedImageGenerations(db, input.serverId, messageIds),
        readChatMessageReactions(db, input.serverId, messageIds),
        readMessageTaskLinks(db, input.serverId, messageIds),
    ]);
    const claimByMessageId = new Map(projected.map((claim) => [claim.messageId, claim]));
    const claims: ClaimListItem[] = [];
    let backgroundCount = 0;
    for (const row of visible) {
        const claim = claimByMessageId.get(row.claim.messageId);
        if (!claim) {
            continue;
        }
        if (claim.tier === 'background' && !input.includeBackground) {
            backgroundCount += 1;
            continue;
        }
        claims.push({
            chatKind: row.chatKind as 'captain' | 'channel' | 'dm',
            chatName: row.chatName,
            chatPeerUserId: row.chatPeerUserId,
            message: {
                ...toChatMessage(row.message, {
                    body: bodies.get(row.message.id),
                    workers: works.get(row.message.id),
                    imageGenerations: images.get(row.message.id),
                    reactions: reactions.get(row.message.id),
                    taskLinks: taskLinks.get(row.message.id),
                }),
                claim,
            },
            claim,
        });
    }
    return { backgroundCount, claims };
}
