import { and, desc, eq, sql } from 'drizzle-orm';
import {
    readAgentSessionGeneration,
    recordExactMessagesServed,
    recordHeldThrough,
} from '../agent-delivery/cursors.ts';
import { readMessageAttachments } from '../attachments/message-attachments.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatMessagesTable } from '../postgres/schema.ts';
import {
    advanceSeenThroughVisible,
    readFreshnessScope,
    unseenAttention,
} from './freshness-attention.ts';
import { messageSelection, toAgentMessages } from './message-view.ts';
import { clearAgentDraft, readDraft, requireDraft, saveDraft } from './send-draft-state.ts';
import { AgentSendModeError, requireContent, validateMode } from './send-mode-validation.ts';

/** Raft's `ATTESTED_SEND_HELD_CONTEXT_LIMIT`: a hold shows at most this many messages. */
const holdWindow = 3;

/**
 * Raft suggests `--send-draft --anyway` once a draft was held three times
 * before the current hold, so from its fourth hold. Haus also refuses
 * `continueAnyway` before then.
 */
const anywayAfterHolds = 3;

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
    const generation = await readAgentSessionGeneration(db, runner.agentId);
    const draft = await readDraft(db, runner, chatId, generation);
    const outgoing = input.sendDraft
        ? requireDraft(draft)
        : {
              attachmentIds: input.attachmentIds,
              content: requireContent(input.content),
              ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
              reholdCount: draft?.reholdCount ?? 0,
          };
    if (input.continueAnyway && !canSendAnyway(outgoing.reholdCount)) {
        throw new AgentSendModeError(
            'continueAnyway is only available after repeated holds of the same draft.',
            'SEND_ANYWAY_NOT_ELIGIBLE',
            409
        );
    }
    const hold = input.continueAnyway ? null : await readFreshnessHold(db, runner, chatId);
    if (!hold) {
        return { kind: 'send' as const, outgoing };
    }
    const reholdCount = outgoing.reholdCount + 1;
    await saveDraft(db, runner, chatId, generation, {
        ...outgoing,
        reholdCount,
    });
    return {
        kind: 'held' as const,
        response: {
            ...hold,
            continueAnywaySuggested: canSendAnyway(reholdCount),
            reholdCount,
            state: 'held' as const,
        },
    };
}

/**
 * The freshness check every Agent-authored post into a Chat runs: newer
 * messages delivered to this Agent (every reply in a Thread) that it has
 * neither seen nor been served (`unseenAttention`). A hold shows the latest
 * few, marks them served to this run, and records the newest as the session's
 * held-through boundary, so a re-post is held only for messages newer still
 * (Raft's hold `seenUpToSeq`). A clean check advances the seen cursor.
 */
export async function readFreshnessHold(db: HausDatabase, runner: ResolvedRunner, chatId: string) {
    const hold = await resolveHold(db, runner, chatId);
    if (!hold) {
        return null;
    }
    const handle = await readAgentHandle(db, runner);
    return {
        formalMentionCount: countMentions(hold.messages, handle),
        newMessageCount: hold.total,
        omittedMessageCount: Math.max(0, hold.total - hold.messages.length),
        shownMessages: hold.messages,
    };
}

async function resolveHold(db: HausDatabase, runner: ResolvedRunner, chatId: string) {
    const scope = await readFreshnessScope(db, runner, chatId);
    if (
        !scope ||
        (scope.kind !== 'channel' && scope.kind !== 'thread') ||
        scope.latest <= scope.after
    ) {
        return null;
    }
    const unseen = unseenAttention(scope, scope.after);
    const [count] = await db
        .select({ total: sql<number>`count(*)::int` })
        .from(chatMessagesTable)
        .where(unseen);
    const rows = (
        await db
            .select(messageSelection)
            .from(chatMessagesTable)
            .where(unseen)
            .orderBy(desc(chatMessagesTable.sequence))
            .limit(holdWindow)
    ).reverse();
    const newest = rows.at(-1);
    if (!newest) {
        await advanceSeenThroughVisible(db, scope);
        return null;
    }
    await recordExactMessagesServed(db, {
        agentId: runner.agentId,
        messages: rows.map((row) => ({ chatId: row.chatId, id: row.id })),
        runId: runner.runId,
        serverId: runner.serverId,
    });
    await recordHeldThrough(db, {
        agentId: runner.agentId,
        chatId,
        sequence: newest.sequence,
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

/** Whether a draft held `holds` times may be sent despite newer messages. */
function canSendAnyway(holds: number) {
    return holds > anywayAfterHolds;
}

function countMentions(messages: Array<{ content: string }>, agentHandle: string) {
    return countAgentFormalMentions(messages, agentHandle);
}

function escapeRegex(value: string) {
    return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
