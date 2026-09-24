import type { ChatSendInput, RoutingBypassReason } from '@haus/api';
import { planAgentMessageRecipients } from '../agent-delivery/message-recipients.ts';
import { requireChatWriteAccess } from '../chats/chat-access.ts';
import { mentionedAgentIds } from '../chats/reply-subscriptions.ts';
import { readExistingChatMessage } from '../chats/send-message-replay.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readChannelHumanIds, readRoutingAgents, readRoutingState } from './context.ts';
import type { MessageRouter, RoutingDecision, RoutingState } from './jev.ts';

export type PreparedMessageRouting =
    | { kind: 'bypass'; reason: RoutingBypassReason }
    /** One eligible Agent and one human member: the message is addressed without Jev. */
    | { kind: 'sole'; agentId: string; authorId: string }
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
    const shape = shapeBypass(input);
    if (shape) {
        return bypass(shape);
    }
    if (!(member && 'chatId' in input)) {
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
    const [sole] = recipients;
    if (!sole) {
        return bypass('recipient-count');
    }
    // One eligible Agent: addressed outright when the author is the channel's
    // only human, otherwise Jev decides between that Agent and the humans.
    const memberHumanIds =
        recipients.length === 1
            ? await readChannelHumanIds(db, input.serverId, input.chatId)
            : undefined;
    if (memberHumanIds?.length === 1 && memberHumanIds[0] === member.id) {
        return { kind: 'sole', agentId: sole.agentId, authorId: member.id };
    }
    if (!router) {
        return bypass('disabled');
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
        memberHumanIds,
    });
    if (!state) {
        return bypass(chat.lastMessageSequence === 0 ? 'no-context' : 'context-limit');
    }
    const started = performance.now();
    return {
        kind: 'judged',
        sequence: chat.lastMessageSequence,
        agentsFingerprint: JSON.stringify(agents),
        candidateAgentIds,
        decision: await judgeSafely(router, state),
        elapsedMs: Math.round(performance.now() - started),
    };
}

/** Message shapes that keep their deterministic delivery before any read. */
function shapeBypass(input: ChatSendInput): RoutingBypassReason | null {
    if ('thread' in input && input.thread) {
        return 'thread';
    }
    if (input.replyToMessageId) {
        return 'reply';
    }
    if (input.attachmentIds.length) {
        return 'attachments';
    }
    return input.content.length > 8000 ? 'context-limit' : null;
}

async function judgeSafely(router: MessageRouter, state: RoutingState): Promise<RoutingDecision> {
    try {
        return await router.judge(state);
    } catch {
        return { kind: 'broadcast', reason: 'failure' };
    }
}

function bypass(reason: RoutingBypassReason): PreparedMessageRouting {
    return { kind: 'bypass', reason };
}
