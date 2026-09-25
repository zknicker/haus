import type { MessageRoutingAudit, RoutingBypassReason } from '@haus/api';
import { eq } from 'drizzle-orm';
import type { AgentMessageRecipientPlan } from '../agent-delivery/message-recipients.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable } from '../postgres/schema.ts';
import { readChannelHumanIds, readRoutingAgents } from './context.ts';
import { routingModel, routingPromptVersion, routingThreshold } from './jev.ts';
import { mentionScopePromptVersion } from './mention-scope.ts';
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
    if (prepared.kind === 'sole') {
        // Rechecked in the transaction: a second Agent or human joining since
        // preparation makes the message ordinary channel traffic again.
        const humanIds = await readChannelHumanIds(db, input.serverId, input.chatId);
        const addressed =
            candidateAgentIds.length === 1 &&
            candidateAgentIds[0] === prepared.agentId &&
            humanIds.length === 1 &&
            humanIds[0] === prepared.authorId;
        if (addressed) {
            finalRecipients = recipients.map((row) => ({
                ...row,
                addressedReason: 'sole' as const,
            }));
        }
        audit = {
            ...unjudgedAudit(candidateAgentIds),
            outcome: addressed ? 'bypass' : 'stale',
            bypassReason: addressed ? 'sole' : null,
        };
    } else if (prepared.kind === 'bypass') {
        audit = {
            ...unjudgedAudit(candidateAgentIds),
            bypassReason: bypassReason(input, prepared.reason),
        };
    } else if (prepared.kind === 'mention-judged') {
        const stale = await isStale(db, input, prepared, candidateAgentIds);
        const mentioned = recipients.filter((row) => row.mentioned);
        // Mentioned rows already carry `addressedReason: 'mention'`; a confident
        // judgment only drops the unmentioned channel Agents.
        const narrowed = !stale && prepared.decision.kind === 'mentioned' && mentioned.length > 0;
        finalRecipients = narrowed ? mentioned : recipients;
        audit = mentionAudit(prepared, finalRecipients, stale, narrowed);
    } else {
        const stale = await isStale(db, input, prepared, candidateAgentIds);
        const decision = prepared.decision;
        const selected =
            decision.kind === 'narrow'
                ? recipients.filter((row) => row.agentId === decision.agentId)
                : [];
        const narrowed = !stale && decision.kind === 'narrow' && selected.length === 1;
        // A committed narrow is addressing: the surviving Agent is the sole
        // conversational addressee, which is what a cold start drains on.
        finalRecipients = narrowed
            ? selected.map((row) => ({ ...row, addressedReason: 'routing' as const }))
            : recipients;
        audit = judgedAudit(prepared, finalRecipients, stale, narrowed);
    }
    await db
        .update(chatMessagesTable)
        .set({ deliveryRouting: audit })
        .where(eq(chatMessagesTable.id, input.messageId));
    return finalRecipients;
}

/**
 * A judgment made before the transaction applies only to the same snapshot:
 * message sequence, eligible recipients, and active Agent metadata.
 */
async function isStale(
    db: HausDatabase,
    input: RoutingCommit,
    prepared: Extract<PreparedMessageRouting, { kind: 'judged' | 'mention-judged' }>,
    candidateAgentIds: string[]
) {
    return (
        input.sequence !== prepared.sequence ||
        JSON.stringify(candidateAgentIds) !== JSON.stringify(prepared.candidateAgentIds) ||
        JSON.stringify(await readRoutingAgents(db, input.serverId, input.chatId)) !==
            prepared.agentsFingerprint
    );
}

function unjudgedAudit(candidateAgentIds: string[]): MessageRoutingAudit {
    return {
        outcome: 'bypass',
        bypassReason: null,
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

/** `bypassReason: 'mention'` records that the mention-scope question ran instead of the audience question. */
function mentionAudit(
    prepared: Extract<PreparedMessageRouting, { kind: 'mention-judged' }>,
    recipients: AgentMessageRecipientPlan[],
    stale: boolean,
    narrowed: boolean
): MessageRoutingAudit {
    const { decision } = prepared;
    return {
        model: routingModel,
        promptVersion: mentionScopePromptVersion,
        bypassReason: 'mention',
        outcome: stale
            ? 'stale'
            : decision.kind === 'broadcast'
              ? decision.reason
              : narrowed
                ? 'mentioned'
                : 'invalid',
        candidateAgentIds: prepared.candidateAgentIds,
        recipientAgentIds: recipients.map((row) => row.agentId),
        confidence: decision.confidence ?? null,
        probability: decision.probability ?? null,
        choice: decision.kind === 'mentioned' ? 'mentioned' : (decision.choice ?? null),
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
