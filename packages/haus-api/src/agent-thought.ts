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

/** The longest tool-action description a Computer sends (a command line, a file, a tool). */
export const agentThoughtActionMaxLength = 200;

/**
 * A scrubbed, one-line description of a tool action the run just started:
 * a shell command with URLs reduced to host and path words and secrets,
 * tokens, and emails removed; a file's basename; or a tool name with a short
 * argument summary. Never raw output or full arguments.
 */
export const agentThoughtActionSchema = z
    .string()
    .trim()
    .min(1)
    .max(agentThoughtActionMaxLength)
    .regex(/^[^\p{Cc}]+$/u);

/** The most of a tool's output a Computer sends with its action, after scrubbing. */
export const agentThoughtResultMaxLength = 400;

/**
 * A scrubbed excerpt of what a finished tool action returned, so the Server
 * can state a finding ("Saturday looks wet") instead of the activity: markup,
 * URLs' credentials and queries, emails, paths, token-like strings, and the
 * values of secret-named or environment-style variables removed, then capped.
 * Held for one summarizer call, never stored or logged. Line breaks are its
 * only control characters.
 */
export const agentThoughtResultSchema = z
    .string()
    .trim()
    .min(1)
    .max(agentThoughtResultMaxLength)
    .regex(/^[^\p{Cc}]*(?:\n[^\p{Cc}]*)*$/u);

const agentThoughtFrameFields = {
    agentId: idSchema,
    at: timestampSchema,
    runId: idSchema,
    type: z.literal('agent-thought'),
};

/**
 * The frame a Computer sends while its accepted run works (ADR 0036).
 * `phrase` carries a Codex title finished on the Computer, `reasoning` a
 * scrubbed excerpt, and `action` a scrubbed description of a tool action —
 * when it has finished, with a scrubbed `result` excerpt of what it returned.
 * The Server rephrases any of them, or drops it as housekeeping, before
 * announcing anything. A Server that predates a kind drops its frames as
 * unknown. Never persisted.
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
    z
        .object({
            ...agentThoughtFrameFields,
            action: agentThoughtActionSchema,
            kind: z.literal('action'),
            result: agentThoughtResultSchema.optional(),
        })
        .strict(),
]);
export type AgentThoughtFrame = z.infer<typeof agentThoughtFrameSchema>;

/** What a run's narrator hands its frame sender: the frame without its routing fields. */
export type AgentThoughtContent =
    | { at: string; kind: 'phrase'; text: string }
    | { at: string; kind: 'reasoning'; reasoning: string }
    | { action: string; at: string; kind: 'action'; result?: string };

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
