import type { ClaimList, ClaimListItem, ThreadSummary } from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import { readMessageBodies } from '../chats/message-bodies.ts';
import { readChatMessageReactions } from '../chats/message-reactions.ts';
import { toChatMessage } from '../chats/message-shape.ts';
import { readLinkedCloudAgentWork } from '../cloud-agents/linked-cloud-agent-work.ts';
import { readLinkedImageGenerations } from '../image-generation/linked-image-generations.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageClaimsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { readMessageTaskLinks } from '../tasks/task-reference-links.ts';
import { listThreadSummaries } from '../threads/list-thread-summaries.ts';
import type { HausUser } from '../users/haus-user.ts';
import { projectMessageClaims } from './claim-shape.ts';
import {
    type ClaimWorkThreadRow,
    claimWorkThreadAnchorId,
    claimWorkThreadChatId,
} from './claim-work-thread.ts';

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

    // A claim's chat is always its top-level Channel or DM, Thread claims included.
    const visible = rows.filter((row) => row.chatKind === 'channel' || row.chatKind === 'dm');
    const messageIds = visible.map((row) => row.claim.messageId);
    const workAnchorIds = [...new Set(visible.map((row) => claimWorkThreadAnchorId(row.claim)))];
    const [projected, bodies, works, images, reactions, summaries, taskLinks] = await Promise.all([
        projectMessageClaims(
            db,
            input.serverId,
            visible.map((row) => row.claim)
        ),
        readMessageBodies(db, input.serverId, messageIds),
        readLinkedCloudAgentWork(db, input.serverId, messageIds),
        readLinkedImageGenerations(db, input.serverId, messageIds),
        readChatMessageReactions(db, input.serverId, messageIds),
        listThreadSummaries(db, member, {
            anchorMessageIds: workAnchorIds,
            serverId: input.serverId,
        }),
        readMessageTaskLinks(db, input.serverId, messageIds),
    ]);
    const claimByMessageId = new Map(projected.map((claim) => [claim.messageId, claim]));
    const summaryByAnchorId = new Map(
        summaries.map((summary) => [summary.anchorMessageId, summary])
    );
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
            chatKind: row.chatKind as 'channel' | 'dm',
            chatName: row.chatName,
            chatPeerUserId: row.chatPeerUserId,
            message: {
                ...toChatMessage(row.message, {
                    body: bodies.get(row.message.id),
                    cloudAgentWork: works.get(row.message.id),
                    imageGenerations: images.get(row.message.id),
                    reactions: reactions.get(row.message.id),
                    taskLinks: taskLinks.get(row.message.id),
                }),
                claim,
            },
            claim,
            // A Thread claim's summary is the Thread it sits in.
            threadSummary:
                summaryByAnchorId.get(claimWorkThreadAnchorId(row.claim)) ??
                emptyThreadSummary(row.claim),
        });
    }
    return { backgroundCount, claims };
}

/**
 * A claim whose Thread nobody has replied in yet has no Thread row, and its work
 * surface reads as exactly that: no replies, nothing unread, nothing followed.
 */
function emptyThreadSummary(claim: ClaimWorkThreadRow): ThreadSummary {
    return {
        anchorMessageId: claimWorkThreadAnchorId(claim),
        followed: false,
        latestReplyAt: null,
        recentReplies: [],
        replyCount: 0,
        threadChatId: claimWorkThreadChatId(claim),
        unreadCount: 0,
    };
}
