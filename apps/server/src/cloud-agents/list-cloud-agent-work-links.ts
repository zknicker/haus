import type { CloudAgentWorkLink } from '@haus/api';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, cloudAgentWorkLinksTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { linkChatVisibleSql, linkParentChatsTable } from './cloud-agent-work-visibility.ts';

/** Every conversation the viewer can read that links this work, once each, oldest link first. */
export async function listCloudAgentWorkLinks(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string; workIds: string[] }
): Promise<CloudAgentWorkLink[]> {
    await requireServerMembership(db, member, input.serverId);
    if (!member || input.workIds.length === 0) {
        return [];
    }
    const rows = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            chatId: chatsTable.id,
            parentChatId: chatsTable.parentChatId,
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
                linkChatVisibleSql(input.serverId, { kind: 'user', userId: member.id })
            )
        )
        .orderBy(asc(cloudAgentWorkLinksTable.createdAt));

    const links = new Map<string, CloudAgentWorkLink>();
    for (const { anchorMessageId, chatId, parentChatId, workId } of rows) {
        const link = { anchorMessageId, chatId: parentChatId ?? chatId, workId };
        links.set(`${workId}\0${link.chatId}\0${anchorMessageId ?? ''}`, link);
    }
    return [...links.values()];
}
