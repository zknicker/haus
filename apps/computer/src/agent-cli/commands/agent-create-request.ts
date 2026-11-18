import { createHash } from 'node:crypto';
import {
    type AgentCreateAgentInput,
    type AgentCreateAgentReceipt,
    agentCreateAgentReceiptSchema,
} from '@haus/api';
import { type AgentApiRequester, AgentApiTransportError } from '../agent-api-client.ts';

/** Avatar generation alone takes up to 75 s; a create that waits on one needs the headroom. */
const createWithAvatarTimeoutMs = 120_000;
const CREATE_ROUTE = '/api/agent/agents';

/** The create exactly as the Agent asked for it, before the nonce is derived from it. */
export type AgentCreateRequest = Omit<AgentCreateAgentInput, 'nonce'>;

/**
 * The Server treats the nonce as the idempotency key, so it is derived from the
 * request rather than minted: re-issuing the identical command replays the
 * original creation instead of minting a second teammate, and changing any
 * field asks for a different one. The Server scopes nonces to the creating
 * Agent on its Server. Channel order and
 * repeats say nothing about which Agent this is, so they are normalized away.
 */
export function deriveAgentCreateNonce(callerAgentId: string, request: AgentCreateRequest): string {
    const canonical = JSON.stringify([
        callerAgentId,
        request.target,
        request.displayName,
        request.description,
        request.avatarConcept,
        request.brief,
        [...new Set(request.channels)].sort(),
        // Appended only when set, so emoji-less requests keep their pre-emoji nonce.
        ...(request.signatureEmoji === null ? [] : [request.signatureEmoji]),
    ]);
    return `agent-create-${createHash('sha256').update(canonical).digest('hex')}`;
}

/**
 * A create that never got an answer may already have created the Agent, and the
 * nonce is stable, so exactly one retry is worth spending: it either replays the
 * first attempt's receipt or performs the create the first attempt never
 * reached. Only an unanswered request is retried — a refusal is the Server's
 * decision, and repeating it would just be refused again.
 */
export async function requestAgentCreate(
    client: AgentApiRequester,
    callerAgentId: string,
    request: AgentCreateRequest
): Promise<AgentCreateAgentReceipt> {
    const input = {
        body: { ...request, nonce: deriveAgentCreateNonce(callerAgentId, request) },
        method: 'POST' as const,
        ...(request.avatarConcept ? { timeoutMs: createWithAvatarTimeoutMs } : {}),
    };
    try {
        return await client.request(CREATE_ROUTE, agentCreateAgentReceiptSchema, input);
    } catch (cause) {
        if (!(cause instanceof AgentApiTransportError)) {
            throw cause;
        }
        return await client.request(CREATE_ROUTE, agentCreateAgentReceiptSchema, input);
    }
}
