import type { ChannelCreateInput, Chat } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { openAgentChatRead } from '../agent-reads/agent-chat-reads.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatsTable,
} from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { prepareLifecycleEvent } from './lifecycle-events.ts';
import { listChats } from './list-chats.ts';

export class ChannelAgentNotFoundError extends Error {
    constructor() {
        super('Choose Agents that belong to this Server.');
    }
}

export class ChannelNameTakenError extends Error {
    constructor() {
        super('A channel already uses that name.');
    }
}

export interface CreatedChannel {
    chat: Chat;
    event: PreparedRealtimeEvent;
}

export async function createChannel(
    db: HausDatabase,
    member: HausUser | null,
    input: ChannelCreateInput
): Promise<CreatedChannel> {
    const created = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireServerMembership(tx, member, input.serverId);
        if (!member) {
            throw new Error('Authenticated Server membership requires a Haus User.');
        }
        const agentIds = [...new Set(input.agentIds)].sort();
        const agents = await tx
            .select({ id: agentsTable.id })
            .from(agentsTable)
            .where(
                and(
                    eq(agentsTable.serverId, input.serverId),
                    inArray(agentsTable.id, agentIds),
                    isNull(agentsTable.retiredAt)
                )
            );

        if (agents.length !== agentIds.length) {
            throw new ChannelAgentNotFoundError();
        }

        return await insertChannel(tx, {
            agentIds,
            color: input.color,
            description: input.description,
            icon: input.icon,
            name: input.name,
            serverId: input.serverId,
            userIds: [member.id],
        });
    });

    const channel = (await listChats(db, member, input.serverId)).find(
        (candidate) => candidate.id === created.chatId
    );
    if (!channel) {
        throw new Error('Failed to open the new channel.');
    }
    return { chat: channel, event: created.event };
}

/** The participants and appearance one new channel starts with, already authorized. */
export interface NewChannel {
    agentIds: string[];
    color?: ChannelCreateInput['color'];
    description?: ChannelCreateInput['description'];
    icon?: ChannelCreateInput['icon'];
    name: string;
    serverId: string;
    userIds: string[];
}

/**
 * The one write seam for a new channel, shared by the human dialog and
 * `haus channel create`. The caller holds the Server lock and has authorized
 * every participant; a human sees a channel only as its participant, so each
 * caller names at least one human.
 */
export async function insertChannel(
    tx: HausDatabase,
    input: NewChannel
): Promise<{ chatId: string; event: PreparedRealtimeEvent }> {
    const id = createOpaqueId('cht');
    try {
        await tx.insert(chatsTable).values({
            color: input.color ?? null,
            description: input.description ?? null,
            icon: input.icon ?? null,
            id,
            kind: 'channel',
            name: input.name,
            serverId: input.serverId,
        });
    } catch (error) {
        if (violatesConstraint(error, 'chats_server_channel_name_key')) {
            throw new ChannelNameTakenError();
        }
        throw error;
    }

    await tx
        .insert(channelParticipantsTable)
        .values(input.userIds.map((userId) => ({ chatId: id, serverId: input.serverId, userId })));
    await tx
        .insert(channelAgentParticipantsTable)
        .values(
            input.agentIds.map((agentId) => ({ agentId, chatId: id, serverId: input.serverId }))
        );
    for (const agentId of input.agentIds) {
        await openAgentChatRead(tx, { agentId, chatId: id, serverId: input.serverId });
    }
    const event = prepareLifecycleEvent({ chatId: id, serverId: input.serverId }, 'created');
    return { chatId: id, event };
}
