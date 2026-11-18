import type { Chat } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { listChats } from '../chats/list-chats.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { channelAgentParticipantsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';

export async function listAgentChats(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
): Promise<Chat[]> {
    const [visibleChats, channelRows] = await Promise.all([
        listChats(db, member, input.serverId),
        db
            .select({ chatId: channelAgentParticipantsTable.chatId })
            .from(channelAgentParticipantsTable)
            .where(
                and(
                    eq(channelAgentParticipantsTable.serverId, input.serverId),
                    eq(channelAgentParticipantsTable.agentId, input.agentId)
                )
            ),
    ]);
    const channelIds = new Set(channelRows.map((row) => row.chatId));
    return visibleChats.filter(
        (chat) => chat.peerAgentId === input.agentId || channelIds.has(chat.id)
    );
}
