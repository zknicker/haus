import type { ChannelUpdateInput, Chat } from '@haus/api';
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { violatesConstraint } from '../postgres/constraint-violation.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    chatsTable,
    taskKeysTable,
} from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { joinChannelAgents } from './channel-agent-membership.ts';
import { requireChatWritable } from './chat-access.ts';
import { ChannelAgentNotFoundError, ChannelNameTakenError } from './create-channel.ts';
import { prepareLifecycleEvent } from './lifecycle-events.ts';
import { listChats } from './list-chats.ts';

export class ChannelNotFoundError extends Error {
    constructor() {
        super('That channel does not exist on this Server.');
    }
}

export interface UpdatedChannel {
    chat: Chat;
    /** Null when the save changed no name, description, appearance, or Agent participant. */
    event: PreparedRealtimeEvent | null;
}

/** Renames a channel, updates its description and appearance, and replaces its Agent participant set. */
export async function updateChannel(
    db: HausDatabase,
    member: HausUser | null,
    input: ChannelUpdateInput
): Promise<UpdatedChannel> {
    const event = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        await requireServerMembership(tx, member, input.serverId);
        if (!member) {
            throw new Error('Authenticated Server membership requires a Haus User.');
        }
        await requireChatWritable(tx, input);

        const [chat] = await tx
            .select({
                color: chatsTable.color,
                description: chatsTable.description,
                icon: chatsTable.icon,
                id: chatsTable.id,
                kind: chatsTable.kind,
                name: chatsTable.name,
                taskKeyId: chatsTable.taskKeyId,
            })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId)));
        if (!chat || chat.kind !== 'channel') {
            throw new ChannelNotFoundError();
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

        const previousAgentIds = (
            await tx
                .select({ agentId: channelAgentParticipantsTable.agentId })
                .from(channelAgentParticipantsTable)
                .where(
                    and(
                        eq(channelAgentParticipantsTable.serverId, input.serverId),
                        eq(channelAgentParticipantsTable.chatId, input.chatId)
                    )
                )
        )
            .map((row) => row.agentId)
            .sort();
        // `undefined` means the caller left that field alone; `null` clears it.
        const appearance = {
            ...(input.color === undefined ? {} : { color: input.color }),
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.icon === undefined ? {} : { icon: input.icon }),
            ...(input.taskKeyId === undefined
                ? {}
                : { taskKeyId: await requireTaskKey(tx, input.serverId, input.taskKeyId) }),
        };
        const changed =
            chat.name !== input.name ||
            previousAgentIds.join() !== agentIds.join() ||
            editsChange(chat, appearance);

        try {
            await tx
                .update(chatsTable)
                .set({ ...appearance, name: input.name })
                .where(
                    and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.chatId))
                );
        } catch (error) {
            if (violatesConstraint(error, 'chats_server_channel_name_key')) {
                throw new ChannelNameTakenError();
            }
            throw error;
        }

        await tx
            .delete(channelAgentParticipantsTable)
            .where(
                and(
                    eq(channelAgentParticipantsTable.serverId, input.serverId),
                    eq(channelAgentParticipantsTable.chatId, input.chatId),
                    notInArray(channelAgentParticipantsTable.agentId, agentIds)
                )
            );
        await joinChannelAgents(tx, { agentIds, chatId: input.chatId, serverId: input.serverId });

        return changed ? prepareLifecycleEvent(input, 'updated') : null;
    });

    const channel = (await listChats(db, member, input.serverId)).find(
        (candidate) => candidate.id === input.chatId
    );
    if (!channel) {
        throw new Error('Failed to reload the updated channel.');
    }
    return { chat: channel, event };
}

type ChannelEdits = Partial<Record<'color' | 'description' | 'icon' | 'taskKeyId', unknown>>;

/** Whether any field the caller set differs from the stored Channel. */
function editsChange(chat: ChannelEdits, edits: ChannelEdits): boolean {
    return (['color', 'description', 'icon', 'taskKeyId'] as const).some(
        (field) => edits[field] !== undefined && edits[field] !== chat[field]
    );
}

/** A Channel's Tasks take an entry of the Server's key ledger (ADR 0052 decision 11). */
async function requireTaskKey(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    taskKeyId: string
): Promise<string> {
    const [entry] = await db
        .select({ id: taskKeysTable.id })
        .from(taskKeysTable)
        .where(and(eq(taskKeysTable.serverId, serverId), eq(taskKeysTable.id, taskKeyId)))
        .limit(1);
    if (!entry) {
        throw new TaskKeyNotFoundError();
    }
    return entry.id;
}

export class TaskKeyNotFoundError extends Error {
    constructor() {
        super('That Task key is not in this Server’s key ledger.');
        this.name = 'TaskKeyNotFoundError';
    }
}
