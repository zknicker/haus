import type { HausAgentMessage } from '@haus/api';
import { and, desc, eq, gt, ilike, lt, sql } from 'drizzle-orm';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    channelAgentParticipantsTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';
import {
    messageSelection,
    targetForChat,
    toAgentMessages,
    visibleChatSql,
} from './message-view.ts';
import { AgentTargetError, resolveAgentTarget } from './resolve-target.ts';

export async function resolveAgentMessage(
    db: HausDatabase,
    runner: ResolvedRunner,
    id: string
): Promise<HausAgentMessage> {
    const rows = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                id.startsWith('msg_')
                    ? eq(chatMessagesTable.id, id)
                    : ilike(chatMessagesTable.id, `msg_${escapeLike(id)}%`)
            )
        )
        .limit(2);
    if (rows.length !== 1) {
        throw new AgentTargetError(
            rows.length === 0 ? 'That message does not exist.' : 'That message id is ambiguous.'
        );
    }
    await requireAgentChatAccess(db, runner, rows[0].chatId);
    return (await toAgentMessages(db, runner.serverId, rows))[0];
}

export async function searchAgentMessages(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: {
        after?: Date;
        before?: Date;
        limit: number;
        offset: number;
        query: string;
        sender?: string;
        sort: 'recent' | 'relevance';
        target?: string;
    }
): Promise<(HausAgentMessage & { target: string })[]> {
    const targetChatId = input.target
        ? await resolveAgentTarget(db, runner, input.target)
        : undefined;
    const rows = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId)
            )
        )
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, chatMessagesTable.serverId),
                eq(agentsTable.id, chatMessagesTable.authorAgentId)
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                targetChatId ? eq(chatMessagesTable.chatId, targetChatId) : visibleChatSql(runner),
                sql`${chatMessagesTable.searchVector}
                    @@ websearch_to_tsquery('simple', ${input.query})`,
                input.sender ? eq(agentsTable.handle, stripAt(input.sender)) : undefined,
                input.after ? gt(chatMessagesTable.createdAt, input.after) : undefined,
                input.before ? lt(chatMessagesTable.createdAt, input.before) : undefined
            )
        )
        .orderBy(
            input.sort === 'relevance'
                ? desc(
                      sql`ts_rank(${chatMessagesTable.searchVector},
                          websearch_to_tsquery('simple', ${input.query}))`
                  )
                : desc(chatMessagesTable.createdAt),
            desc(chatMessagesTable.id)
        )
        .offset(input.offset)
        .limit(input.limit);
    const messages = await toAgentMessages(db, runner.serverId, rows);
    return await Promise.all(
        messages.map(async (message) => ({
            ...message,
            target: await targetForChat(db, runner.serverId, message.chat_id),
        }))
    );
}

export async function requireAgentChatAccess(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string
): Promise<void> {
    const [chat] = await db
        .select({
            dmAgentId: chatsTable.dmAgentId,
            id: chatsTable.id,
            kind: chatsTable.kind,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat) {
        throw new AgentTargetError();
    }
    if (chat.kind === 'dm' && chat.dmAgentId === runner.agentId) {
        return;
    }
    if (chat.kind === 'thread' && chat.parentChatId) {
        const [parentDm] = await db
            .select({ id: chatsTable.id })
            .from(chatsTable)
            .where(
                and(
                    eq(chatsTable.serverId, runner.serverId),
                    eq(chatsTable.id, chat.parentChatId),
                    eq(chatsTable.kind, 'dm'),
                    eq(chatsTable.dmAgentId, runner.agentId)
                )
            )
            .limit(1);
        if (parentDm) {
            return;
        }
    }
    const channelId = chat.kind === 'thread' ? chat.parentChatId : chat.id;
    if (channelId) {
        const [joined] = await db
            .select({ agentId: channelAgentParticipantsTable.agentId })
            .from(channelAgentParticipantsTable)
            .where(
                and(
                    eq(channelAgentParticipantsTable.serverId, runner.serverId),
                    eq(channelAgentParticipantsTable.chatId, channelId),
                    eq(channelAgentParticipantsTable.agentId, runner.agentId)
                )
            )
            .limit(1);
        if (joined) {
            return;
        }
    }
    throw new AgentTargetError();
}

function escapeLike(value: string) {
    return value.replaceAll(/[\\%_]/gu, '\\$&');
}

function stripAt(value: string) {
    return value.startsWith('@') ? value.slice(1) : value;
}
