import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/** How much of a waking message a trigger quotes: enough for any one-line title. */
export const AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH = 1000;

/**
 * The waking message as its title source: the head of its raw Markdown
 * (collapsing it to one line is the reader's job, as with `chatLastMessage`)
 * and how many attachments it carries. Null when the message no longer exists.
 */
export const agentTurnTriggerPreviewSchema = z
    .object({
        attachmentCount: z.number().int().nonnegative(),
        content: z.string().max(AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH),
    })
    .strict();

export type AgentTurnTriggerPreview = z.infer<typeof agentTurnTriggerPreviewSchema>;

/**
 * What woke an Agent turn: the inbox item the Server chose when it dispatched the
 * run. A message or task trigger quotes its message (`preview`), so a turn row is
 * titled in the same read that lists it. The Server reads that quote only for a
 * Chat the reader can see; any other trigger is `private` and carries nothing.
 *
 * - `message`: a Chat message from a human or another Agent.
 * - `task`: a task assignment; `messageId` is the task's message.
 * - `reminder`, `trigger`, `cloud_agent`, `onboarding`: typed work anchored to a Chat
 *   with no message of its own.
 * - `private`: the turn has a recorded trigger in a Chat the reader cannot see.
 */
export const agentTurnTriggerSchema = z.discriminatedUnion('kind', [
    z
        .object({
            author: z.enum(['agent', 'human']),
            chatId: idSchema,
            kind: z.literal('message'),
            messageId: idSchema,
            preview: agentTurnTriggerPreviewSchema.nullable(),
        })
        .strict(),
    z
        .object({
            chatId: idSchema,
            kind: z.literal('task'),
            messageId: idSchema,
            preview: agentTurnTriggerPreviewSchema.nullable(),
        })
        .strict(),
    z.object({ chatId: idSchema, kind: z.literal('reminder') }).strict(),
    z.object({ chatId: idSchema, kind: z.literal('trigger') }).strict(),
    z.object({ chatId: idSchema, kind: z.literal('cloud_agent') }).strict(),
    z.object({ chatId: idSchema, kind: z.literal('onboarding') }).strict(),
    z.object({ kind: z.literal('private') }).strict(),
]);

export type AgentTurnTrigger = z.infer<typeof agentTurnTriggerSchema>;

/** One run's trigger beside an Activity History page, keyed by the page's run ids. */
export const agentRunTriggerEntrySchema = z
    .object({ runId: idSchema, trigger: agentTurnTriggerSchema.nullable() })
    .strict();

export type AgentRunTriggerEntry = z.infer<typeof agentRunTriggerEntrySchema>;
