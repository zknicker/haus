import { and, desc, eq, gt, ne, or, sql } from 'drizzle-orm';
import {
    advanceSeenCursor,
    readAgentInboxCursor,
    recordExactMessagesServed,
} from '../agent-delivery/cursors.ts';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInboxExactVisibilityTable,
    agentsTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';
import { messageSelection, toAgentMessages } from './message-view.ts';
import { clearAgentDraft, readDraft, requireDraft, saveDraft } from './send-draft-state.ts';
import { AgentSendModeError, requireContent, validateMode } from './send-mode-validation.ts';

const maxHoldMessages = 12;

export { AgentSendModeError, clearAgentDraft };

export interface AgentSendModeInput {
    attachmentIds: string[];
    content?: string;
    continueAnyway: boolean;
    nonce: string;
    replyToMessageId?: string;
    sendDraft: boolean;
}

export async function prepareAgentSend(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    input: AgentSendModeInput
) {
    validateMode(input);
    const committed = await readCommittedSend(db, runner, chatId, input.nonce);
    if (committed) {
        return {
            kind: 'send' as const,
            outgoing: {
                attachmentIds: committed.attachmentIds,
                content: input.content ?? committed.content,
                ...(input.replyToMessageId !== undefined
                    ? { replyToMessageId: input.replyToMessageId }
                    : committed.replyToMessageId
                      ? { replyToMessageId: committed.replyToMessageId }
                      : {}),
            },
        };
    }
    const cursor = await readAgentInboxCursor(db, { ...runner, chatId });
    const draft = await readDraft(db, runner, chatId, cursor.generation);
    const outgoing = input.sendDraft
        ? requireDraft(draft)
        : {
              attachmentIds: input.attachmentIds,
              content: requireContent(input.content),
              ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
              reholdCount: draft?.reholdCount ?? 0,
          };
    if (input.continueAnyway && outgoing.reholdCount < 2) {
        throw new AgentSendModeError(
            'continueAnyway is only available after repeated holds of the same draft.',
            'SEND_ANYWAY_NOT_ELIGIBLE',
            409
        );
    }
    const hold = input.continueAnyway
        ? null
        : await resolveHold(db, runner, chatId, cursor.generation, cursor.seen);
    if (!hold) {
        return { kind: 'send' as const, outgoing };
    }
    const handle = await readAgentHandle(db, runner);
    const reholdCount = outgoing.reholdCount + 1;
    await saveDraft(db, runner, chatId, cursor.generation, {
        ...outgoing,
        reholdCount,
    });
    return {
        kind: 'held' as const,
        response: {
            continueAnywaySuggested: reholdCount >= 2,
            formalMentionCount: countMentions(hold.messages, handle),
            newMessageCount: hold.total,
            omittedMessageCount: Math.max(0, hold.total - hold.messages.length),
            reholdCount,
            shownMessages: hold.messages,
            state: 'held' as const,
        },
    };
}

async function resolveHold(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    sessionGeneration: number,
    horizon: number
) {
    const [chat] = await db
        .select({ kind: chatsTable.kind, latest: chatsTable.lastMessageSequence })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat || (chat.kind !== 'channel' && chat.kind !== 'thread') || chat.latest <= horizon) {
        return null;
    }
    const peer = and(
        eq(chatMessagesTable.serverId, runner.serverId),
        eq(chatMessagesTable.chatId, chatId),
        gt(chatMessagesTable.sequence, horizon),
        sql`not exists (
            select 1 from ${agentInboxExactVisibilityTable} exact_visibility
            where exact_visibility.server_id = ${runner.serverId}
              and exact_visibility.agent_id = ${runner.agentId}
              and exact_visibility.session_generation = ${sessionGeneration}
              and exact_visibility.chat_id = ${chatId}
              and exact_visibility.message_id = ${chatMessagesTable.id}
              and (
                exact_visibility.seen_at is not null
                or exact_visibility.served_run_id = ${runner.runId}
              )
        )`,
        or(
            sql`${chatMessagesTable.authorUserId} is not null`,
            and(
                sql`${chatMessagesTable.authorAgentId} is not null`,
                ne(chatMessagesTable.authorAgentId, runner.agentId)
            )
        )
    );
    const [count] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(chatMessagesTable)
        .where(peer);
    const rows = (
        await db
            .select(messageSelection)
            .from(chatMessagesTable)
            .where(peer)
            .orderBy(desc(chatMessagesTable.sequence))
            .limit(maxHoldMessages)
    ).reverse();
    if (rows.length === 0) {
        // This query has proven that every freshness-relevant message through
        // the current Chat head is either behind the boundary or exactly seen.
        await advanceSeenCursor(db, {
            agentId: runner.agentId,
            chatId,
            sequence: chat.latest,
            serverId: runner.serverId,
        });
        return null;
    }
    await recordExactMessagesServed(db, {
        agentId: runner.agentId,
        messages: rows.map((row) => ({ chatId: row.chatId, id: row.id })),
        runId: runner.runId,
        serverId: runner.serverId,
    });
    return {
        messages: await toAgentMessages(db, runner.serverId, rows),
        total: count?.total ?? rows.length,
    };
}

async function readCommittedSend(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string,
    nonce: string
) {
    const [message] = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            content: chatMessagesTable.content,
            id: chatMessagesTable.id,
            replyToMessageId: chatMessagesTable.replyToMessageId,
        })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.chatId, chatId),
                eq(chatMessagesTable.nonce, nonce)
            )
        )
        .limit(1);
    if (!message || message.authorAgentId !== runner.agentId) {
        return null;
    }
    const attachmentIds = (
        (await readMessageAttachments(db, runner.serverId, [message.id])).get(message.id) ?? []
    ).map(({ id }) => id);
    return {
        attachmentIds,
        content: message.content,
        replyToMessageId: message.replyToMessageId ?? undefined,
    };
}

async function readAgentHandle(db: HausDatabase, runner: ResolvedRunner) {
    const [agent] = await db
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    if (!agent) {
        throw new AgentSendModeError('The Agent no longer exists.', 'AGENT_NOT_FOUND', 404);
    }
    return agent.handle;
}

export function countAgentFormalMentions(
    messages: Array<{ content: string }>,
    agentHandle: string
) {
    const mention = new RegExp(`(^|\\s)@${escapeRegex(agentHandle)}(?=$|[\\s.,!?;:])`, 'iu');
    return messages.filter(({ content }) => mention.test(content)).length;
}

function countMentions(messages: Array<{ content: string }>, agentHandle: string) {
    return countAgentFormalMentions(messages, agentHandle);
}

function escapeRegex(value: string) {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
