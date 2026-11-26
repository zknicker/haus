import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable } from '../postgres/schema.ts';
import { parseTaskTarget, resolveTaskTargetChat } from './resolve-task-target.ts';

export async function resolveAgentTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
): Promise<string> {
    const taskShortId = parseTaskTarget(target);
    if (taskShortId) {
        return await requireTaskTarget(db, runner, taskShortId);
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
            .where(
                and(
                    eq(chatsTable.serverId, runner.serverId),
                    eq(chatsTable.kind, 'channel'),
                    eq(chatsTable.name, channelName),
                    isNull(chatsTable.deletedAt)
                )
            )
            .limit(1);
        if (channel) {
            return channel.id;
        }
        throw new AgentTargetError();
    }

    if (target.startsWith(captainTargetPrefix)) {
        const [handle, messageShortId, ...extra] = target
            .slice(captainTargetPrefix.length)
            .split(':');
        if (!handle || extra.length > 0) {
            throw new AgentTargetError();
        }
        if (messageShortId) {
            throw new MessageTargetRefusedError(`${captainTargetPrefix}${handle}`, messageShortId);
        }
        const [chat] = await db
            .select({ id: chatsTable.id })
            .from(chatsTable)
            .innerJoin(
                agentsTable,
                and(
                    eq(agentsTable.serverId, chatsTable.serverId),
                    eq(agentsTable.id, chatsTable.captainAgentId)
                )
            )
            .where(
                and(
                    eq(chatsTable.serverId, runner.serverId),
                    eq(chatsTable.kind, 'captain'),
                    sql`lower(${agentsTable.handle}) = lower(${handle})`,
                    isNull(agentsTable.retiredAt)
                )
            )
            .limit(1);
        if (chat) {
            return chat.id;
        }
    }

    throw new AgentTargetError();
}

async function requireTaskTarget(db: HausDatabase, runner: ResolvedRunner, taskShortId: string) {
    const task = await resolveTaskTargetChat(db, runner, taskShortId);
    if (!task) {
        throw new AgentTargetError();
    }
    return task.chatId;
}

export const captainTargetPrefix = 'captain:@';

export function formatCaptainTarget(handle: string) {
    return `${captainTargetPrefix}${handle}`;
}

export class AgentTargetError extends Error {
    constructor(message = 'That target does not exist.') {
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
