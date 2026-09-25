import { z } from 'zod';
import {
    thoughtMinimumReasoningLength,
    thoughtReasoningExcerptMaxLength,
} from './agent-thought-phrase.ts';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/** The longest thought phrase the Server relays; phrases aim for about seven words. */
export const agentThoughtTextMaxLength = 80;

/** One line of plain text: no control characters, newlines, or markup fences. */
export const agentThoughtTextSchema = z
    .string()
    .trim()
    .min(1)
    .max(agentThoughtTextMaxLength)
    .regex(/^[^\p{Cc}`]+$/u);

/**
 * A scrubbed reasoning excerpt (`thoughtReasoningExcerpt`) the Server
 * summarizes into a phrase and then discards. Line breaks are its only
 * control characters.
 */
export const agentThoughtReasoningSchema = z
    .string()
    .trim()
    .min(thoughtMinimumReasoningLength)
    .max(thoughtReasoningExcerptMaxLength)
    .regex(/^[^\p{Cc}]*(?:\n[^\p{Cc}]*)*$/u);

const agentThoughtFrameFields = {
    agentId: idSchema,
    at: timestampSchema,
    runId: idSchema,
    type: z.literal('agent-thought'),
};

/**
 * The frame a Computer sends while its accepted run reasons (ADR 0036).
 * `phrase` carries a Codex title finished on the Computer and `reasoning` a
 * scrubbed excerpt; the Server rephrases either, or drops it as housekeeping,
 * before announcing anything. Never persisted.
 */
export const agentThoughtFrameSchema = z.discriminatedUnion('kind', [
    z
        .object({
            ...agentThoughtFrameFields,
            kind: z.literal('phrase'),
            text: agentThoughtTextSchema,
        })
        .strict(),
    z
        .object({
            ...agentThoughtFrameFields,
            kind: z.literal('reasoning'),
            reasoning: agentThoughtReasoningSchema,
        })
        .strict(),
]);
export type AgentThoughtFrame = z.infer<typeof agentThoughtFrameSchema>;

/** What a run's narrator hands its frame sender: the frame without its routing fields. */
export type AgentThoughtContent =
    | { at: string; kind: 'phrase'; text: string }
    | { at: string; kind: 'reasoning'; reasoning: string };

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
