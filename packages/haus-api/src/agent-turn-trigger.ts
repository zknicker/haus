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
 * What a heartbeat filed: the head of its report, and the Chat the main session
 * posted in after reading it (null when it only read it, or the Chat is not one
 * the reader can see).
 */
export const agentTurnHeartbeatReportSchema = z
    .object({
        postedChatId: idSchema.nullable(),
        text: z.string().max(AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH),
    })
    .strict();

export type AgentTurnHeartbeatReport = z.infer<typeof agentTurnHeartbeatReportSchema>;

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
 * - `dream`: the Agent's private nightly memory pass; no Chat. `learned` is the first line
 *   of what it wrote down, and `added` / `removed` the memory lines it changed.
 * - `heartbeat`: a daytime look around; no Chat. `report` is what the run sent to the main
 *   session, null when it stayed quiet; `yielded` is a run the Server stopped for a message.
 * - `heartbeat_report`: a heartbeat's report arriving in the main session; no Chat.
 *   `heartbeatRunId` names the heartbeat run that sent it.
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
    z
        .object({
            added: z.number().int().nonnegative(),
            kind: z.literal('dream'),
            learned: z.string().max(AGENT_TURN_TRIGGER_PREVIEW_MAX_LENGTH).nullable(),
            removed: z.number().int().nonnegative(),
        })
        .strict(),
    z
        .object({
            kind: z.literal('heartbeat'),
            report: agentTurnHeartbeatReportSchema.nullable(),
            yielded: z.boolean(),
        })
        .strict(),
    z.object({ heartbeatRunId: idSchema, kind: z.literal('heartbeat_report') }).strict(),
    z.object({ kind: z.literal('private') }).strict(),
]);

export type AgentTurnTrigger = z.infer<typeof agentTurnTriggerSchema>;

/** One run's trigger beside an Activity History page, keyed by the page's run ids. */
export const agentRunTriggerEntrySchema = z
    .object({ runId: idSchema, trigger: agentTurnTriggerSchema.nullable() })
    .strict();

export type AgentRunTriggerEntry = z.infer<typeof agentRunTriggerEntrySchema>;
