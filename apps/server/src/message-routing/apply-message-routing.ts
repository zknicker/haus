import type { MessageRoutingAudit, RoutingBypassReason } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { AgentMessageRecipientPlan } from '../agent-delivery/message-recipients.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { readRoutingAgents } from './context.ts';
import { routingModel, routingPromptVersion, routingThreshold } from './jev.ts';
import type { PreparedMessageRouting } from './route-human-message.ts';

interface RoutingCommit {
    chatId: string;
    chatKind: 'channel' | 'dm' | 'thread';
    isReply: boolean;
    messageId: string;
    prepared: PreparedMessageRouting;
    recipients: AgentMessageRecipientPlan[];
    sequence: number;
    serverId: string;
}

export async function applyMessageRouting(db: HausDatabase, input: RoutingCommit) {
    const { prepared, recipients } = input;
    const candidateAgentIds = recipients.map((row) => row.agentId).sort();
    let finalRecipients = recipients;
    let audit: MessageRoutingAudit;
    if (prepared.kind === 'bypass') {
        audit = {
            outcome: 'bypass',
            bypassReason: bypassReason(input, prepared.reason),
            candidateAgentIds,
            recipientAgentIds: candidateAgentIds,
            model: null,
            promptVersion: null,
            confidence: null,
            probability: null,
            choice: null,
            threshold: null,
            elapsedMs: null,
        };
    } else {
        const stale =
            input.sequence !== prepared.sequence ||
            JSON.stringify(candidateAgentIds) !== JSON.stringify(prepared.candidateAgentIds) ||
            JSON.stringify(await readRoutingAgents(db, input.serverId, input.chatId)) !==
                prepared.agentsFingerprint;
        const decision = prepared.decision;
        const selected =
            decision.kind === 'narrow'
                ? recipients.filter((row) => row.agentId === decision.agentId)
                : [];
        const narrowed = !stale && decision.kind === 'narrow' && selected.length === 1;
        finalRecipients = narrowed ? selected : recipients;
        audit = judgedAudit(prepared, finalRecipients, stale, narrowed);
    }
    await db
        .update(chatMessagesTable)
        .set({ deliveryRouting: audit })
        .where(eq(chatMessagesTable.id, input.messageId));
    return finalRecipients;
}

function judgedAudit(
    prepared: Extract<PreparedMessageRouting, { kind: 'judged' }>,
    recipients: AgentMessageRecipientPlan[],
    stale: boolean,
    narrowed: boolean
): MessageRoutingAudit {
    const { decision } = prepared;
    return {
        model: routingModel,
        promptVersion: routingPromptVersion,
        bypassReason: null,
        outcome: stale
            ? 'stale'
            : decision.kind === 'broadcast'
              ? decision.reason
              : narrowed
                ? 'narrow'
                : 'invalid',
        candidateAgentIds: prepared.candidateAgentIds,
        recipientAgentIds: recipients.map((row) => row.agentId),
        confidence: decision.confidence ?? null,
        probability: decision.probability ?? null,
        choice: decision.kind === 'narrow' ? decision.agentId : (decision.choice ?? null),
        threshold: routingThreshold,
        elapsedMs: prepared.elapsedMs,
    };
}

function bypassReason(input: RoutingCommit, reason: RoutingBypassReason): RoutingBypassReason {
    if (input.chatKind === 'dm') {
        return 'direct-message';
    }
    if (input.chatKind === 'thread') {
        return 'thread';
    }
    if (input.isReply) {
        return 'reply';
    }
    if (input.recipients.some((row) => row.mentioned)) {
        return 'mention';
    }
    return reason;
}
