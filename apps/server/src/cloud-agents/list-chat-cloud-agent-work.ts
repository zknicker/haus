import type { ThreadCloudAgentWork } from '@haus/api';
import { and, asc, eq, or } from 'drizzle-orm';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, cloudAgentWorkLinksTable, cloudAgentWorkTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readRuns, toCloudAgentWork } from './cloud-agent-shape.ts';
import { linkChatVisibleSql, linkParentChatsTable } from './cloud-agent-work-visibility.ts';

/**
 * Durable work linked in a conversation and its Threads, including settled
 * outcomes (ADR 0044). A link inside a Thread anchors on that Thread's anchor;
 * any other on its linking Message. One row per anchor and work.
 */
export async function listChatCloudAgentWork(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string; chatId: string }
): Promise<ThreadCloudAgentWork[]> {
    await requireChatAccess(db, member, input);
    if (!member) {
        return [];
    }
    const rows = await db
        .select({
            anchor: chatsTable.anchorMessageId,
            kind: chatsTable.kind,
            messageId: cloudAgentWorkLinksTable.messageId,
            work: cloudAgentWorkTable,
        })
        .from(cloudAgentWorkLinksTable)
        .innerJoin(
            cloudAgentWorkTable,
            and(
                eq(cloudAgentWorkTable.serverId, cloudAgentWorkLinksTable.serverId),
                eq(cloudAgentWorkTable.id, cloudAgentWorkLinksTable.workId)
            )
        )
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
                or(eq(chatsTable.id, input.chatId), eq(chatsTable.parentChatId, input.chatId)),
                linkChatVisibleSql(input.serverId, { kind: 'user', userId: member.id })
            )
        )
        .orderBy(
            asc(cloudAgentWorkLinksTable.createdAt),
            asc(cloudAgentWorkLinksTable.messageId),
            asc(cloudAgentWorkLinksTable.ordinal)
        );
    const runs = await readRuns(db, input.serverId, [...new Set(rows.map(({ work }) => work.id))]);
    const seen = new Set<string>();
    const listed: ThreadCloudAgentWork[] = [];
    for (const { anchor, kind, messageId, work } of rows) {
        const anchorMessageId = kind === 'thread' ? anchor : messageId;
        if (!anchorMessageId) {
            throw new Error('A Cloud Agent work link in a Thread has no Thread anchor.');
        }
        const key = `${anchorMessageId}\0${work.id}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        listed.push({ anchorMessageId, work: toCloudAgentWork(work, runs.get(work.id) ?? []) });
    }
    return listed;
}
