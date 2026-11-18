import { and, eq, isNull, sql } from 'drizzle-orm';

import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    channelAgentParticipantsTable,
    chatsTable,
    serverMembershipsTable,
} from '../postgres/schema.ts';
import { parseTaskTarget, resolveTaskTargetChat } from './resolve-task-target.ts';

export async function resolveAgentTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
): Promise<string> {
    const taskKey = parseTaskTarget(target);
    if (taskKey) {
        return await requireTaskTarget(db, runner, taskKey);
    }
    if (target.startsWith('#')) {
        const [channelName, messageShortId, ...extra] = target.slice(1).split(':');
        if (!channelName || extra.length > 0) {
            throw new AgentTargetError();
        }
        if (messageShortId) {
            throw new MessageTargetRefusedError(`#${channelName}`, messageShortId);
        }
        const [channel] = await db
            .select({ id: chatsTable.id })
            .from(chatsTable)
            .innerJoin(
                channelAgentParticipantsTable,
                and(
                    eq(channelAgentParticipantsTable.serverId, chatsTable.serverId),
                    eq(channelAgentParticipantsTable.chatId, chatsTable.id),
                    eq(channelAgentParticipantsTable.agentId, runner.agentId)
                )
            )
            .where(
                and(
                    eq(chatsTable.serverId, runner.serverId),
                    eq(chatsTable.kind, 'channel'),
                    eq(chatsTable.name, channelName)
                )
            )
            .limit(1);
        if (channel) {
            return channel.id;
        }
        throw new AgentTargetError();
    }

    if (target.startsWith('dm:@')) {
        const [peer, messageShortId, ...extra] = target.slice('dm:@'.length).split(':');
        if (!peer || extra.length > 0) {
            throw new AgentTargetError();
        }
        if (messageShortId) {
            throw new MessageTargetRefusedError(`dm:@${peer}`, messageShortId);
        }
        const chats = await db
            .select({ id: chatsTable.id })
            .from(chatsTable)
            .innerJoin(
                serverMembershipsTable,
                and(
                    eq(serverMembershipsTable.serverId, chatsTable.serverId),
                    eq(serverMembershipsTable.userId, chatsTable.dmMemberOneUserId)
                )
            )
            .where(
                and(
                    eq(chatsTable.serverId, runner.serverId),
                    eq(chatsTable.kind, 'dm'),
                    eq(chatsTable.dmAgentId, runner.agentId),
                    sql`lower(${serverMembershipsTable.handle}) = lower(${peer})`,
                    isNull(serverMembershipsTable.revokedAt)
                )
            )
            .limit(2);
        if (chats.length === 1) {
            return chats[0].id;
        }
    }

    throw new AgentTargetError();
}

async function requireTaskTarget(db: HausDatabase, runner: ResolvedRunner, taskKey: string) {
    const task = await resolveTaskTargetChat(db, runner, taskKey);
    if (!task) {
        throw new AgentTargetError();
    }
    return task.chatId;
}

export class AgentTargetError extends Error {
    constructor(message = 'That target does not exist or this Agent has not joined it.') {
        super(message);
        this.name = 'AgentTargetError';
    }
}

export class MessageTargetRefusedError extends AgentTargetError {
    constructor(parent: string, shortId: string) {
        super(
            `"${parent}:${shortId}" names a side conversation on a message, and Haus has none. ` +
                `Reply inline instead: haus message send --target "${parent}" --reply-to ${shortId}. ` +
                'For work that outlasts a reply, start a Task from a channel message: ' +
                'haus task start --target "#channel" --from <shortid> --title <text>.'
        );
        this.name = 'MessageTargetRefusedError';
    }
}

export function escapeLike(value: string) {
    return value.replaceAll(/[\\%_]/gu, '\\$&');
}
