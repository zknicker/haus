import * as z from 'zod';
import { agentIdempotencyKeySchema } from './agent-idempotency.ts';

/** One `haus claim create` posts at most this many claim-messages. */
export const AGENT_CLAIM_CREATE_MAX_TITLES = 20;

/**
 * `haus claim create` behind the loopback proxy. The runner credential fixes the
 * author and Server. `nonce` is the idempotency key: the Server stores
 * `<nonce>:<index>` on each claim-message, so a retry replays the whole batch.
 */
export const agentClaimCreateInputSchema = z
    .object({
        assignee: z.string().optional(),
        content: z.string().optional(),
        nonce: agentIdempotencyKeySchema,
        target: z.string().min(1),
        titles: z.array(z.string().min(1)).max(AGENT_CLAIM_CREATE_MAX_TITLES).optional(),
    })
    .strict();

export type AgentClaimCreateInput = z.infer<typeof agentClaimCreateInputSchema>;
