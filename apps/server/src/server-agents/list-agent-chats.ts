import type { Chat } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { listChats } from '../chats/list-chats.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';

export async function listAgentChats(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
): Promise<Chat[]> {
    const visibleChats = await listChats(db, member, input.serverId);
    const [agent] = await db
        .select({ homeProjectId: agentsTable.homeProjectId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.agentId)))
        .limit(1);
    return visibleChats.filter(
        (chat) => chat.peerAgentId === input.agentId || chat.id === agent?.homeProjectId
    );
}
