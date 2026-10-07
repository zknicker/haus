import { and, asc, desc, eq, gt, ilike, lt, sql } from 'drizzle-orm';
import { listUnservedThreadFollowReactivationIds } from '../agent-delivery/store.ts';
import {
    advanceAgentChatRead,
    advanceAgentChatReadContiguous,
    readAgentChatRead,
} from '../agent-reads/agent-chat-reads.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { type MessageRow, messageSelection, toAgentMessages } from './message-view.ts';
import { AgentTargetError, escapeLike, resolveAgentTarget } from './resolve-target.ts';

export interface AgentHistoryInput {
    after?: string;
    around?: string;
    before?: string;
    limit: number;
    target: string;
    /** `message read --unread`: the page right after the read position, which it then advances. */
    unread?: boolean;
}

interface ReadPosition {
    agentId: string;
    chatId: string;
    serverId: string;
}

/**
 * `haus message read`. A plain page moves the Agent's read position only when
 * it continues from it; `--unread` starts right after the position and moves
 * it through what it returned, before responding.
 */
export async function readAgentHistory(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: AgentHistoryInput
) {
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const position = { agentId: runner.agentId, chatId, serverId: runner.serverId };
    if (input.unread) {
        return await readUnreadHistory(db, runner, position, input);
    }
    const anchor = input.after ?? input.before ?? input.around;
    const anchorSequence = anchor
        ? await resolveSequence(db, runner.serverId, chatId, anchor)
        : null;
    const rows = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.chatId, chatId),
                input.after && anchorSequence !== null
                    ? gt(chatMessagesTable.sequence, anchorSequence)
                    : undefined,
                input.before && anchorSequence !== null
                    ? lt(chatMessagesTable.sequence, anchorSequence)
                    : undefined,
                input.around && anchorSequence !== null
                    ? and(
                          gt(
                              chatMessagesTable.sequence,
                              Math.max(0, anchorSequence - Math.floor(input.limit / 2) - 1)
                          ),
                          lt(
                              chatMessagesTable.sequence,
                              anchorSequence + Math.ceil(input.limit / 2) + 1
                          )
                      )
                    : undefined
            )
        )
        .orderBy(
            input.before || !anchor
                ? desc(chatMessagesTable.sequence)
                : asc(chatMessagesTable.sequence)
        )
        .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    if (input.before || !anchor) {
        page.reverse();
    }
    const lastRead = await readLastRead(db, position);
    const first = page[0];
    const last = page.at(-1);
    if (first && last) {
        await advanceAgentChatReadContiguous(db, {
            ...position,
            from: first.sequence,
            through: last.sequence,
        });
    }
    return {
        has_more: hasMore,
        has_newer: Boolean(input.before),
        has_older: hasMore || Boolean(input.after),
        last_read: lastRead,
        ...(await historyPage(db, runner, page)),
        target: input.target,
    };
}

async function readUnreadHistory(
    db: HausDatabase,
    runner: ResolvedRunner,
    position: ReadPosition,
    input: AgentHistoryInput
) {
    const lastRead = await readLastRead(db, position);
    const unreadAfter = lastRead.after;
    const rows = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, position.serverId),
                eq(chatMessagesTable.chatId, position.chatId),
                gt(chatMessagesTable.sequence, unreadAfter)
            )
        )
        .orderBy(asc(chatMessagesTable.sequence))
        .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    if (last) {
        await advanceAgentChatRead(db, { ...position, through: last.sequence });
    }
    return {
        has_more: hasMore,
        has_newer: hasMore,
        has_older: unreadAfter > 0,
        last_read: lastRead,
        ...(await historyPage(db, runner, page)),
        read_through_seq: await readAgentChatRead(db, position),
        target: input.target,
        unread_after_seq: unreadAfter,
    };
}

async function historyPage(db: HausDatabase, runner: ResolvedRunner, page: MessageRow[]) {
    return {
        messages: await toAgentMessages(db, runner.serverId, page),
        thread_follow_reactivated_message_ids: await listUnservedThreadFollowReactivationIds(db, {
            agentId: runner.agentId,
            dedupeKeys: page.map((message) => message.id),
            runId: runner.runId,
        }),
    };
}

/**
 * The read position before this read moves it (Raft's pre-read `last_read`),
 * and the same position as `unread_after` while someone else's message sits
 * above it (-1 when nothing is unread).
 */
async function readLastRead(db: HausDatabase, position: ReadPosition) {
    const [row] = (await db.execute(sql`
        select position.sequence as after, exists (
            select 1 from chat_messages unread
            where unread.server_id = ${position.serverId}
              and unread.chat_id = ${position.chatId}
              and unread.sequence > position.sequence
              and unread.author_agent_id is distinct from ${position.agentId}
        ) as unread
        from (
            select coalesce((
                select read.sequence from agent_chat_reads read
                where read.server_id = ${position.serverId}
                  and read.agent_id = ${position.agentId}
                  and read.chat_id = ${position.chatId}
            ), 0) as sequence
        ) position
    `)) as Array<{ after: number; unread: boolean }>;
    const after = row?.after ?? 0;
    return { after, unread_after: row?.unread ? after : -1 };
}

async function resolveSequence(
    db: HausDatabase,
    serverId: string,
    chatId: string,
    anchor: string
): Promise<number> {
    if (/^\d+$/u.test(anchor)) {
        return Number(anchor);
    }
    const [message] = await db
        .select({ sequence: chatMessagesTable.sequence })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                eq(chatMessagesTable.chatId, chatId),
                anchor.startsWith('msg_')
                    ? eq(chatMessagesTable.id, anchor)
                    : ilike(chatMessagesTable.id, `msg_${escapeLike(anchor)}%`)
            )
        )
        .limit(1);
    if (!message) {
        throw new AgentTargetError('That history anchor does not exist in this target.');
    }
    return message.sequence;
}
