import { z } from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/** The longest thought phrase the Server relays; the Computer aims for about seven words. */
export const agentThoughtTextMaxLength = 80;

/**
 * One short, present-tense status phrase condensed on the Computer from a
 * reasoning block. Raw reasoning never crosses the boundary; only this phrase
 * does, and only when the Computer enables thoughts (prototype, ADR 0036).
 */
export const agentThoughtTextSchema = z
    .string()
    .trim()
    .min(1)
    .max(agentThoughtTextMaxLength)
    // One line of plain text: no control characters, newlines, or markup fences.
    .regex(/^[^\p{Cc}`]+$/u);

/** The frame a Computer sends while its accepted run reasons. Never persisted. */
export const agentThoughtFrameSchema = z
    .object({
        agentId: idSchema,
        at: timestampSchema,
        runId: idSchema,
        text: agentThoughtTextSchema,
        type: z.literal('agent-thought'),
    })
    .strict();
export type AgentThoughtFrame = z.infer<typeof agentThoughtFrameSchema>;

/**
 * A volatile thought, announced once per Chat its run engages (ADR 0035) and
 * delivered only to readers of that Chat. Never persisted or replayed.
 */
export const agentThoughtEventSchema = z
    .object({
        agentId: idSchema,
        at: timestampSchema,
        chatId: idSchema,
        runId: idSchema,
        serverId: idSchema,
        text: agentThoughtTextSchema,
    })
    .strict();
export type AgentThoughtEvent = z.infer<typeof agentThoughtEventSchema>;

export const agentThoughtSubscriptionInputSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();
