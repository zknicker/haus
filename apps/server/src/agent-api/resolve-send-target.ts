import { and, eq, isNull, sql } from 'drizzle-orm';
import { ensureAgentDmRecord } from '../chats/ensure-agent-dm.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, serverMembershipsTable } from '../postgres/schema.ts';
import { ensureThreadWithAnchorFollow } from '../threads/ensure-thread.ts';
import { AgentTargetError, escapeLike, resolveAgentTarget } from './resolve-target.ts';

/**
 * Send-only resolver: beyond the strict targets an Agent may already read, a
 * send may open the DM with a human it has not written to yet, and may create
 * the canonical Thread for a visible anchor Message. A DM is between a human
 * and an Agent, so `dm:@<agent-handle>` resolves to nothing here.
 */
export async function resolveAgentSendTarget(
    db: HausDatabase,
    runner: ResolvedRunner,
    target: string
): Promise<string> {
    try {
        return await resolveAgentTarget(db, runner, target);
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
    return (
        await ensureThreadWithAnchorFollow(db, {
            anchorMessageId: anchors[0].id,
            parentChatId: parsed.parentChatId,
            serverId: runner.serverId,
        })
    ).id;
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
): Promise<{ anchor: string; parentChatId: string } | null> {
    if (target.startsWith('#')) {
        const [channelName, anchor, ...extra] = target.slice(1).split(':');
        if (!(channelName && anchor) || extra.length > 0) {
            return null;
        }
        const parentChatId = await resolveAgentTarget(db, runner, `#${channelName}`);
        return { anchor, parentChatId };
    }
    if (target.startsWith('dm:@')) {
        const [peer, anchor, ...extra] = target.slice('dm:@'.length).split(':');
        if (!(peer && anchor) || extra.length > 0) {
            return null;
        }
        return { anchor, parentChatId: await resolveAgentTarget(db, runner, `dm:@${peer}`) };
    }
    return null;
}
