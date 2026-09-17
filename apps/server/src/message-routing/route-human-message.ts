import type { ChatSendInput, RoutingBypassReason } from '@haus/api';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import { mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import { readExistingChatMessage } from '../chats/send-message-replay.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readRoutingAgents, readRoutingState } from './context.ts';
import type { MessageRouter, RoutingDecision } from './jev.ts';

export type PreparedMessageRouting =
    | { kind: 'bypass'; reason: RoutingBypassReason }
    | {
          kind: 'judged';
          agentsFingerprint: string;
          candidateAgentIds: string[];
          decision: RoutingDecision;
          elapsedMs: number;
          sequence: number;
      };

export async function prepareMessageRouting(
    db: HausDatabase,
    member: HausUser | null,
    input: ChatSendInput,
    router?: MessageRouter
): Promise<PreparedMessageRouting> {
    if ('thread' in input && input.thread) {
        return bypass('thread');
    }
    if (input.replyToMessageId) {
        return bypass('reply');
    }
    if (input.attachmentIds.length) {
        return bypass('attachments');
    }
    if (input.content.length > 8000) {
        return bypass('context-limit');
    }
    if (!(router && member && 'chatId' in input)) {
        return bypass('disabled');
    }
    const chat = await requireChatWriteAccess(db, member, {
        chatId: input.chatId,
        serverId: input.serverId,
    });
    if (chat.kind !== 'channel') {
        return bypass(chat.kind === 'dm' ? 'direct-message' : 'thread');
    }
    if (await readExistingChatMessage(db, input.serverId, input.chatId, input.nonce)) {
        return bypass('disabled'); // The transaction returns the original receipt and audit.
    }
    const agents = await readRoutingAgents(db, input.serverId, input.chatId);
    if (agents.length > 32) {
        return bypass('context-limit');
    }
    if (mentionedAgentIds(input.content, agents).size) {
        return bypass('mention');
    }
    const recipients = await planAgentMessageRecipients(db, {
        authorAgentId: null,
        chatId: input.chatId,
        content: input.content,
        serverId: input.serverId,
    });
    if (recipients.length < 2) {
        return bypass('recipient-count');
    }
    const candidateAgentIds = recipients.map((row) => row.agentId).sort();
    const state = await readRoutingState(db, {
        serverId: input.serverId,
        chatId: input.chatId,
        sequence: chat.lastMessageSequence,
        authorId: member.id,
        content: input.content,
        agents,
        eligibleAgentIds: candidateAgentIds,
    });
    if (!state) {
        return bypass(chat.lastMessageSequence === 0 ? 'no-context' : 'context-limit');
    }
    let decision: RoutingDecision;
    const started = performance.now();
    try {
        decision = await router.judge(state);
    } catch {
        decision = { kind: 'broadcast', reason: 'failure' };
    }
    return {
        kind: 'judged',
        sequence: chat.lastMessageSequence,
        agentsFingerprint: JSON.stringify(agents),
        candidateAgentIds,
        decision,
        elapsedMs: Math.round(performance.now() - started),
    };
}

function bypass(reason: RoutingBypassReason): PreparedMessageRouting {
    return { kind: 'bypass', reason };
}
