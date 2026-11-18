import { and, eq, isNull, sql } from 'drizzle-orm';
import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, channelAgentParticipantsTable, chatsTable } from '../postgres/schema.ts';

/** One channel an Agent can be put in, named the way Agents write it. */
export interface JoinableChannel {
    id: string;
    name: string;
}

/**
 * The single write seam for channel Agent membership. Every path that puts an
 * Agent in a channel — a human editing the channel, an Agent joining one,
 * `haus channel add`, and Agent creation — goes through here, so membership
 * is one insert with one conflict rule rather than four spellings of it.
 * Returns the Agents that were not already members.
 */
export async function joinChannelAgents(
    db: HausDatabase,
    input: { agentIds: string[]; chatId: string; serverId: string }
): Promise<string[]> {
    if (input.agentIds.length === 0) {
        return [];
    }
    const inserted = await db
        .insert(channelAgentParticipantsTable)
        .values(
            input.agentIds.map((agentId) => ({
                agentId,
                chatId: input.chatId,
                serverId: input.serverId,
            }))
        )
        .onConflictDoNothing()
        .returning({ agentId: channelAgentParticipantsTable.agentId });
    for (const { agentId } of inserted) {
        await openAgentChatRead(db, { agentId, chatId: input.chatId, serverId: input.serverId });
    }
    return inserted.map((row) => row.agentId);
}

/**
 * The Server's `#all` channel, which every Agent belongs to. A Server seeded
 * before `#all` existed has none, and creation simply joins the channels it was
 * asked for instead of failing on a channel that is not there to join.
 */
export async function findAllChannel(
    db: Pick<HausDatabase, 'select'>,
    serverId: string
): Promise<JoinableChannel | null> {
    const [channel] = await db
        .select({ id: chatsTable.id, name: chatsTable.name })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.isAll, true),
                isNull(chatsTable.archivedAt),
                isNull(chatsTable.deletedAt)
            )
        )
        .limit(1);
    return channel?.name ? { id: channel.id, name: channel.name } : null;
}

/**
 * One live, writable channel by `#name`, or null when nothing answers to it.
 * A deleted channel is already being purged, so joining one would insert a
 * membership row into a Chat that is on its way out.
 */
export async function findLiveChannel(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    target: string
): Promise<JoinableChannel | null> {
    const name = target.startsWith('#') ? target.slice(1) : target;
    const [channel] = await db
        .select({ id: chatsTable.id, name: chatsTable.name })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.kind, 'channel'),
                eq(chatsTable.name, name),
                isNull(chatsTable.archivedAt),
                isNull(chatsTable.deletedAt)
            )
        )
        .limit(1);
    return channel?.name ? { id: channel.id, name: channel.name } : null;
}

/** One active Agent of this Server by handle, or null. */
export async function findActiveAgentByHandle(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    handle: string
): Promise<{ factoryKind: 'cove' | 'ordinary'; handle: string; id: string } | null> {
    const [agent] = await db
        .select({
            factoryKind: agentsTable.factoryKind,
            handle: agentsTable.handle,
            id: agentsTable.id,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                sql`lower(${agentsTable.handle}) = lower(${handle})`,
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    return agent ?? null;
}
