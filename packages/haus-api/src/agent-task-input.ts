import * as z from 'zod';
import { agentIdempotencyKeySchema } from './agent-idempotency.ts';

/** One `haus task create` posts at most this many task-messages. */
export const AGENT_TASK_CREATE_MAX_TITLES = 20;

/**
 * `haus task create` behind the loopback proxy. The runner credential fixes the
 * author and Server. `nonce` is the idempotency key: the Server stores
 * `<nonce>:<index>` on each task-message, so a retry replays the whole batch.
 */
export const agentTaskCreateInputSchema = z
    .object({
        assignee: z.string().optional(),
        content: z.string().optional(),
        nonce: agentIdempotencyKeySchema,
        target: z.string().min(1),
        titles: z.array(z.string().min(1)).max(AGENT_TASK_CREATE_MAX_TITLES).optional(),
    })
    .strict();

export type AgentTaskCreateInput = z.infer<typeof agentTaskCreateInputSchema>;
