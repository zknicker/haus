import type { AgentThreadContext, AgentThreadContextMessage, HausAgentMessage } from '@haus/api';
import { and, desc, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { messageSelection, targetForChat, toAgentMessages } from '../agent-api/message-view.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInboxExactVisibilityTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';
import { readAgentInboxCursor } from './cursors.ts';
import type { InboxItemRow } from './store.ts';

/** The replies a package quotes at most, newest kept first. */
const maxRecentReplies = 10;
/** Quoted text across the parent and replies: content, handles, and descriptions. */
const maxQuotedChars = 4000;
/** The parent alone may take half, so a long root never crowds out every reply. */
const maxParentChars = 2000;
/** Per quoted line: the `- [msg=… seq=… time=… type=…] @…: ` frame around the text. */
const lineFrameChars = 80;
/** The block's fixed lines, excluding the three targets it names. */
const blockFrameChars = 260;

/**
 * Raft's `thread_join_context`: for the first human item in each Thread that
 * @mentions this Agent, the Thread's parent message and the replies before the
 * mention, bounded. Keyed by inbox row id. Visibility is not consulted here, so
 * a drain budget built from these sizes is the same on every resend.
 */
export async function readThreadContexts(
    db: HausDatabase,
    rows: InboxItemRow[]
): Promise<Map<string, AgentThreadContext>> {
    const mentions = rows.filter((row) => row.source === 'human' && row.mentioned);
    const serverId = mentions[0]?.serverId;
    if (!serverId) {
        return new Map();
    }
    const threads = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            id: chatsTable.id,
            parentChatId: chatsTable.parentChatId,
        })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                eq(chatsTable.kind, 'thread'),
                inArray(chatsTable.id, [...new Set(mentions.map((row) => row.chatId))])
            )
        );
    const contexts = new Map<string, AgentThreadContext>();
    // Sequential: planning runs inside the transaction holding the Server row.
    for (const thread of threads) {
        const row = mentions.find((mention) => mention.chatId === thread.id);
        if (!(row && thread.anchorMessageId && thread.parentChatId)) {
            continue;
        }
        const context = await readThreadContext(db, {
            anchorMessageId: thread.anchorMessageId,
            mentionMessageId: row.dedupeKey,
            parentChatId: thread.parentChatId,
            serverId,
            threadChatId: thread.id,
        });
        if (context) {
            contexts.set(row.id, context);
        }
    }
    return contexts;
}

/** An upper bound on the rendered block, counted against the drain budget. */
export function threadContextChars(context: AgentThreadContext): number {
    const messages = [context.parentMessage, ...context.recentMessages];
    return (
        blockFrameChars +
        context.parentTarget.length +
        context.threadTarget.length +
        context.suggestedReadTarget.length +
        messages.reduce((total, message) => total + lineFrameChars + quotedChars(message), 0)
    );
}

/**
 * Keeps only the packages whose Thread this Agent has no model-visible context
 * for in its current session: no verified boundary and no settled exact
 * visibility. A fresh session generation has none, so it sees the package again.
 */
export async function withoutVisibleThreads(
    db: HausDatabase,
    input: { agentId: string; contexts: Map<string, AgentThreadContext>; rows: InboxItemRow[] }
): Promise<Map<string, AgentThreadContext>> {
    const kept = new Map<string, AgentThreadContext>();
    for (const row of input.rows) {
        const context = input.contexts.get(row.id);
        const visible =
            context &&
            (await hasVisibleThread(db, {
                agentId: input.agentId,
                chatId: row.chatId,
                serverId: row.serverId,
            }));
        if (context && !visible) {
            kept.set(row.id, context);
        }
    }
    return kept;
}

async function hasVisibleThread(
    db: HausDatabase,
    input: { agentId: string; chatId: string; serverId: string }
): Promise<boolean> {
    const cursor = await readAgentInboxCursor(db, input);
    if (cursor.seen > 0) {
        return true;
    }
    const [settled] = await db
        .select({ id: agentInboxExactVisibilityTable.messageId })
        .from(agentInboxExactVisibilityTable)
        .where(
            and(
                eq(agentInboxExactVisibilityTable.serverId, input.serverId),
                eq(agentInboxExactVisibilityTable.agentId, input.agentId),
                eq(agentInboxExactVisibilityTable.sessionGeneration, cursor.generation),
                eq(agentInboxExactVisibilityTable.chatId, input.chatId),
                isNotNull(agentInboxExactVisibilityTable.seenAt)
            )
        )
        .limit(1);
    return settled !== undefined;
}

async function readThreadContext(
    db: HausDatabase,
    input: {
        anchorMessageId: string;
        mentionMessageId: string;
        parentChatId: string;
        serverId: string;
        threadChatId: string;
    }
): Promise<AgentThreadContext | null> {
    const [mention] = await db
        .select({ sequence: chatMessagesTable.sequence })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.id, input.mentionMessageId)
            )
        )
        .limit(1);
    const [parentRow] = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.parentChatId),
                eq(chatMessagesTable.id, input.anchorMessageId)
            )
        )
        .limit(1);
    if (!(mention && parentRow)) {
        return null;
    }
    const replyRows = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.threadChatId),
                lt(chatMessagesTable.sequence, mention.sequence)
            )
        )
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(maxRecentReplies + 1);
    const [parent, ...replies] = (
        await toAgentMessages(db, input.serverId, [parentRow, ...replyRows])
    ).map(toQuotedMessage);
    if (!parent) {
        return null;
    }
    const bounded = boundReplies(clipParent(parent), replies);
    const threadTarget = await targetForChat(db, input.serverId, input.threadChatId);
    return {
        parentMessage: bounded.parent,
        parentTarget: await targetForChat(db, input.serverId, input.parentChatId),
        recentMessages: bounded.recent,
        suggestedReadTarget: threadTarget,
        threadTarget,
        truncated: bounded.truncated,
    };
}

/** Newest replies first until the count or the quoted-text budget runs out. */
function boundReplies(parent: AgentThreadContextMessage, newestFirst: AgentThreadContextMessage[]) {
    let remaining = maxQuotedChars - quotedChars(parent);
    const recent: AgentThreadContextMessage[] = [];
    for (const reply of newestFirst.slice(0, maxRecentReplies)) {
        if (quotedChars(reply) > remaining) {
            break;
        }
        recent.push(reply);
        remaining -= quotedChars(reply);
    }
    return { parent, recent: recent.reverse(), truncated: recent.length < newestFirst.length };
}

function clipParent(parent: AgentThreadContextMessage): AgentThreadContextMessage {
    if (parent.content.length <= maxParentChars) {
        return parent;
    }
    return { ...parent, clipped: true, content: `${parent.content.slice(0, maxParentChars)}…` };
}

function toQuotedMessage(message: HausAgentMessage): AgentThreadContextMessage {
    const description = message.sender.description?.trim();
    return {
        chatId: message.chat_id,
        content: message.content,
        createdAt: message.created_at,
        id: message.id,
        ...(description ? { senderDescription: description.slice(0, 500) } : {}),
        senderHandle: message.sender.handle ?? 'unknown',
        senderType: message.sender.type === 'agent' ? 'agent' : 'human',
        sequence: message.sequence,
    };
}

function quotedChars(message: AgentThreadContextMessage): number {
    return (
        message.content.length +
        message.senderHandle.length +
        (message.senderDescription?.length ?? 0)
    );
}
