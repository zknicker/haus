import type { Chat } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { chatLastMessageLateral, toChatLastMessage } from './chat-last-message.ts';
import { type ChatListArchive, chatUnreadCount, listedChats } from './chat-unread.ts';

export async function listChats(
    db: HausDatabase,
    member: Pick<HausUser, 'id'> | null,
    serverId: string,
    archive: ChatListArchive = 'active'
): Promise<Chat[]> {
    await requireServerMembership(db, member, serverId);

    if (!member) {
        return [];
    }

    const lastMessage = chatLastMessageLateral(db);
    const rows = await db
        .select({
            archivedAt: chatsTable.archivedAt,
            archivedByUserId: chatsTable.archivedByUserId,
            captainMember: sql<{ subscribed: boolean } | null>`(
                select json_build_object('subscribed', captain_member.subscribed)
                from captain_chat_members captain_member
                where captain_member.server_id = "chats"."server_id"
                    and captain_member.chat_id = "chats"."id"
                    and captain_member.user_id = ${member.id}
            )`,
            // `chats_shape` keeps appearance channel-only, so DM and Captain rows read null.
            color: chatsTable.color,
            createdAt: chatsTable.createdAt,
            description: chatsTable.description,
            icon: chatsTable.icon,
            id: chatsTable.id,
            isAll: chatsTable.isAll,
            kind: sql<'captain' | 'channel' | 'dm'>`${chatsTable.kind}`,
            lastActivityAt: chatsTable.lastActivityAt,
            lastMessage: {
                authorAgentDisplayName: lastMessage.authorAgentDisplayName,
                authorAgentId: lastMessage.authorAgentId,
                authorUserDisplayName: lastMessage.authorUserDisplayName,
                authorUserId: lastMessage.authorUserId,
                content: lastMessage.content,
                createdAt: lastMessage.createdAt,
            },
            lastMessageSequence: chatsTable.lastMessageSequence,
            name: chatsTable.name,
            participantAgentIds: sql<string[]>`
                case
                    when ${chatsTable.kind} = 'dm' then array[]::text[]
                    when ${chatsTable.kind} = 'captain'
                        then array[${chatsTable.captainAgentId}]::text[]
                    else array(
                        select home.id
                        from agents home
                        where home.server_id = "chats"."server_id"
                            and home.home_project_id = "chats"."id"
                            and home.retired_at is null
                        order by home.id
                    )
                end
            `,
            participantUserIds: sql<string[]>`
                case
                    when ${chatsTable.kind} = 'dm'
                        then array_remove(array[
                            ${chatsTable.dmMemberOneUserId},
                            ${chatsTable.dmMemberTwoUserId}
                        ], null)::text[]
                    when ${chatsTable.kind} = 'captain' then array(
                        select captain_member.user_id
                        from captain_chat_members captain_member
                        where captain_member.server_id = "chats"."server_id"
                            and captain_member.chat_id = "chats"."id"
                        order by captain_member.user_id
                    )
                    else array(
                        select participant.user_id
                        from channel_participants participant
                        where participant.server_id = "chats"."server_id"
                            and participant.chat_id = "chats"."id"
                        order by participant.user_id
                    )
                end
            `,
            peerAgentDisplayName: sql<string | null>`
                case
                    when ${chatsTable.kind} = 'captain' then ${agentsTable.displayName}
                    else null
                end
            `,
            peerAgentId: sql<string | null>`
                case
                    when ${chatsTable.kind} = 'captain' then ${chatsTable.captainAgentId}
                    else null
                end
            `,
            peerAgentRetired: sql<boolean>`${agentsTable.retiredAt} is not null`,
            peerUserId: sql<string | null>`
                case
                    when ${chatsTable.kind} = 'dm'
                        then case
                            when ${chatsTable.dmMemberOneUserId} = ${member.id}
                                then ${chatsTable.dmMemberTwoUserId}
                            else ${chatsTable.dmMemberOneUserId}
                        end
                    else null
                end
            `,
            serverId: chatsTable.serverId,
            unreadCount: chatUnreadCount(member.id),
        })
        .from(chatsTable)
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, chatsTable.serverId),
                eq(agentsTable.id, chatsTable.captainAgentId)
            )
        )
        .leftJoinLateral(lastMessage, sql`true`)
        .where(and(eq(chatsTable.serverId, serverId), listedChats(member.id, archive)))
        .orderBy(sql`${chatsTable.lastActivityAt} desc nulls last`, chatsTable.createdAt);

    return rows.map(({ captainMember, lastMessage: lastMessageRow, ...chat }) => ({
        ...chat,
        captainChat:
            chat.kind === 'captain'
                ? { member: captainMember !== null, subscribed: captainMember?.subscribed ?? false }
                : null,
        archivedAt: chat.archivedAt?.toISOString() ?? null,
        createdAt: chat.createdAt.toISOString(),
        lastActivityAt: chat.lastActivityAt?.toISOString() ?? null,
        lastMessage: toChatLastMessage(lastMessageRow),
    }));
}
