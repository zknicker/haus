import { and, asc, eq } from 'drizzle-orm';
import { AgentTargetError } from '../agent-api/resolve-target.ts';
import {
    findLiveChannel,
    type JoinableChannel,
    joinChannelAgents,
} from '../chats/channel-agent-membership.ts';
import { prepareLifecycleEvent } from '../chats/lifecycle-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { channelAgentParticipantsTable, chatsTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';

/**
 * Every channel the creation named, refused whole when one of them is missing
 * or archived. This runs before anything is written — and, through the route's
 * pre-check, before an avatar is generated — so a bad `--channel` costs
 * nothing.
 */
export async function requireCreationChannels(
    db: HausDatabase,
    serverId: string,
    targets: readonly string[]
): Promise<JoinableChannel[]> {
    const channels: JoinableChannel[] = [];
    for (const target of new Set(targets)) {
        const channel = await findLiveChannel(db, serverId, target);
        if (!channel) {
            throw new AgentTargetError(
                `There is no open channel "${target}" on this Server to put the new Agent in.`
            );
        }
        channels.push(channel);
    }
    return channels;
}

/** Puts the new Agent in the lanes the request named, on top of `#all`. */
export async function joinCreationChannels(
    db: HausDatabase,
    serverId: string,
    agentId: string,
    channels: readonly JoinableChannel[]
): Promise<void> {
    for (const channel of channels) {
        await joinChannelAgents(db, { agentIds: [agentId], chatId: channel.id, serverId });
    }
}

/** The channels an Agent is in, `#all` first, as the receipt names them. */
export async function readAgentChannels(
    db: HausDatabase,
    serverId: string,
    agentId: string
): Promise<{ id: string; name: string }[]> {
    const rows = await db
        .select({ id: chatsTable.id, isAll: chatsTable.isAll, name: chatsTable.name })
        .from(channelAgentParticipantsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, channelAgentParticipantsTable.serverId),
                eq(chatsTable.id, channelAgentParticipantsTable.chatId)
            )
        )
        .where(
            and(
                eq(channelAgentParticipantsTable.serverId, serverId),
                eq(channelAgentParticipantsTable.agentId, agentId)
            )
        )
        .orderBy(asc(chatsTable.name));
    const named = rows.flatMap((row) => (row.name ? [{ ...row, name: row.name }] : []));
    return [...named.filter((row) => row.isAll), ...named.filter((row) => !row.isAll)].map(
        (row) => ({ id: row.id, name: row.name })
    );
}

/**
 * A new member changes each of those channels, and the App reads membership
 * from the channel, so every join announces itself the way a human's channel
 * save does.
 */
export function channelMembershipEvents(
    serverId: string,
    channels: readonly { id: string }[]
): PreparedRealtimeEvent[] {
    return channels.map((channel) =>
        prepareLifecycleEvent({ chatId: channel.id, serverId }, 'updated')
    );
}
