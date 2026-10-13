import { and, eq, isNull, sql } from 'drizzle-orm';
import { ensureAgentDmRecord } from '../chats/ensure-agent-dm.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, serverMembershipsTable } from '../postgres/schema.ts';
import { ensureThreadWithAnchorFollow } from '../threads/ensure-thread.ts';
import { AgentTargetError, escapeLike, resolveAgentTarget } from './resolve-target.ts';

/**
 * What a send does with an anchor Message that has no Thread yet: a Message
 * send opens one; a Cloud Agent launch refuses, because its card already gets
 * its own work Thread. Under `refuse`, a Thread row with no Messages (a human
 * Follow on an unanswered Message, or every reply deleted) counts as no Thread:
 * the launch would still be its first Message.
 */
export type AnchorWithoutThread = 'open' | 'refuse';

/**
 * Send-only resolver: beyond the strict targets an Agent may already read, a
 * send may open the DM with a human it has not written to yet, and may create
 * the canonical Thread for a visible anchor Message. A DM is between a human
 * and an Agent, so `dm:@<agent-handle>` resolves to nothing here.
 */
export async function resolveAgentSendTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string,
    anchorWithoutThread: AnchorWithoutThread
): Promise<string> {
    try {
        const chatId = await resolveAgentTarget(db, runner, target);
        if (anchorWithoutThread === 'refuse') {
            await requireThreadConversation(db, runner.serverId, chatId, target);
        }
        return chatId;
    } catch (cause) {
        if (!(cause instanceof AgentTargetError)) {
            throw cause;
        }
    }

    const directHumanHandle = parseDirectHumanHandle(target);
    if (directHumanHandle) {
        const [human] = await db
            .select({ userId: serverMembershipsTable.userId })
            .from(serverMembershipsTable)
            .where(
                and(
                    eq(serverMembershipsTable.serverId, runner.serverId),
                    sql`lower(${serverMembershipsTable.handle}) = lower(${directHumanHandle})`,
                    isNull(serverMembershipsTable.revokedAt)
                )
            )
            .limit(2);
        if (human) {
            return (
                await ensureAgentDmRecord(db, {
                    agentId: runner.agentId,
                    serverId: runner.serverId,
                    userId: human.userId,
                })
            ).id;
        }
    }

    const parsed = await resolveAgentParentTarget(db, runner, target);
    if (!parsed) {
        throw new AgentTargetError();
    }
    const anchors = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.chatId, parsed.parentChatId),
                parsed.anchor.startsWith('msg_')
                    ? eq(chatMessagesTable.id, parsed.anchor)
                    : sql`${chatMessagesTable.id}
                        ilike ${`msg_${escapeLike(parsed.anchor)}%`} escape '\\'`
            )
        )
        .limit(2);
    if (anchors.length !== 1) {
        throw new AgentTargetError();
    }
    if (anchorWithoutThread === 'refuse') {
        throw new ThreadNotOpenError(parsed.parentTarget, anchors[0].id);
    }
    return (
        await ensureThreadWithAnchorFollow(db, {
            anchorMessageId: anchors[0].id,
            parentChatId: parsed.parentChatId,
            serverId: runner.serverId,
        })
    ).id;
}

/** A visible anchor Message whose Thread does not exist, under a refusing send. */
export class ThreadNotOpenError extends Error {
    readonly anchorMessageId: string;
    readonly parentTarget: string;

    constructor(parentTarget: string, anchorMessageId: string) {
        super(`${parentTarget} has no Thread on ${anchorMessageId} yet.`);
        this.anchorMessageId = anchorMessageId;
        this.parentTarget = parentTarget;
        this.name = 'ThreadNotOpenError';
    }
}

/** Refuses a Thread target whose Thread holds no Messages yet. */
async function requireThreadConversation(
    db: HausDatabase,
    serverId: string,
    chatId: string,
    target: string
) {
    const [chat] = await db
        .select({ anchorMessageId: chatsTable.anchorMessageId, kind: chatsTable.kind })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (chat?.kind !== 'thread' || !chat.anchorMessageId) {
        return;
    }
    const [message] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(and(eq(chatMessagesTable.serverId, serverId), eq(chatMessagesTable.chatId, chatId)))
        .limit(1);
    if (!message) {
        const separator = target.lastIndexOf(':');
        throw new ThreadNotOpenError(target.slice(0, separator), chat.anchorMessageId);
    }
}

function parseDirectHumanHandle(target: string) {
    if (!target.startsWith('dm:@')) {
        return null;
    }
    const value = target.slice('dm:@'.length);
    return value && !value.includes(':') ? value : null;
}

async function resolveAgentParentTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
): Promise<{ anchor: string; parentChatId: string; parentTarget: string } | null> {
    if (target.startsWith('#')) {
        const [channelName, anchor, ...extra] = target.slice(1).split(':');
        if (!(channelName && anchor) || extra.length > 0) {
            return null;
        }
        const parentTarget = `#${channelName}`;
        const parentChatId = await resolveAgentTarget(db, runner, parentTarget);
        return { anchor, parentChatId, parentTarget };
    }
    if (target.startsWith('dm:@')) {
        const [peer, anchor, ...extra] = target.slice('dm:@'.length).split(':');
        if (!(peer && anchor) || extra.length > 0) {
            return null;
        }
        const parentTarget = `dm:@${peer}`;
        return {
            anchor,
            parentChatId: await resolveAgentTarget(db, runner, parentTarget),
            parentTarget,
        };
    }
    return null;
}
