import { formatChatReferenceTarget, type MentionOption } from '@haus/api';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { visibleChats } from './chat-visibility.ts';

/** Channel autocomplete options for `#` mentions, scoped to what the member can see. */
export async function listChannelMentionOptions(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string
): Promise<MentionOption[]> {
    if (!member) {
        return [];
    }

    const rows = await db
        .select({
            color: chatsTable.color,
            icon: chatsTable.icon,
            id: chatsTable.id,
            name: chatsTable.name,
        })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.kind, 'channel'),
                isNull(chatsTable.deletedAt),
                isNull(chatsTable.archivedAt),
                isNotNull(chatsTable.name),
                visibleChats(member.id)
            )
        )
        .orderBy(chatsTable.name);

    return rows
        .filter((chat): chat is typeof chat & { name: string } => chat.name !== null)
        .map((chat): MentionOption => ({
            description: 'Channel',
            id: formatChatReferenceTarget(chat.id),
            insertText: `#${chat.name}`,
            kind: 'chat',
            label: chat.name,
            metadata: { chatColor: chat.color, chatIcon: chat.icon },
            projection: 'chat-reference',
            sourceLabel: 'Channels',
        }));
}
