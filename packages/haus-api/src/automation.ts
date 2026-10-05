import * as z from 'zod';

// Declared locally so `chat.ts` can import this module without a cycle.
const idSchema = z.string().trim().min(1);
const timestampSchema = z.iso.datetime({ offset: true });

/** Fire history is retained for the same bounded window across automations. */
export const AUTOMATION_HISTORY_RETENTION_DAYS = 30;

/** Largest trigger payload the thread context card carries. */
export const automationPayloadExcerptMaxChars = 8192;
/** Largest instruction, script, and anchor snippet the provenance surfaces carry. */
export const automationSnippetMaxChars = 200;

export const messageCauseAttributionSchema = z.enum(['explicit', 'inferred']);
export type MessageCauseAttribution = z.infer<typeof messageCauseAttributionSchema>;

export const messageCauseKindSchema = z.enum(['reminder', 'trigger']);
export type MessageCauseKind = z.infer<typeof messageCauseKindSchema>;

/** Trigger and Reminder statuses share one field; the kind says which set applies. */
export const messageCauseStatusSchema = z.enum([
    'armed',
    'canceled',
    'disabled',
    'fired',
    'scheduled',
]);

/**
 * Why an Agent wrote this message. A fire writes nothing to the transcript, so
 * the Agent's own message is the only chat-visible trace of a Trigger or
 * Reminder firing, and this is its provenance. Every field the cause line
 * and its hover card need rides the message itself.
 */
/**
 * What the automation looks like right now, read live from its record. Null
 * once the Trigger or Reminder (or its fire) has been archived; the mark then
 * renders from the snapshot the message carries.
 */
export const messageCauseLiveSchema = z
    .object({
        /** Fires recorded for that automation, this one included. */
        fireCount: z.number().int().positive(),
        /** The Trigger's standing instruction, or the Reminder's script, snipped. */
        instruction: z.string().min(1).max(automationSnippetMaxChars).nullable(),
        lastFiredAt: timestampSchema.nullable(),
        status: messageCauseStatusSchema,
    })
    .strict();

export type MessageCauseLive = z.infer<typeof messageCauseLiveSchema>;

/**
 * A message's provenance. `title`, `summary`, `firedAt`, and `ownerAgentId`
 * are snapshotted onto the message when the cause is recorded, so the mark
 * outlives the automation. `live` is the automation as it stands today, or
 * null when it has been archived.
 */
export const messageCauseSchema = z
    .object({
        /**
         * How the Server learned this: `explicit` from the Agent's own
         * `--cause <fireId>`, `inferred` when the fire was the only item the
         * sending run was offered and the message landed in its anchor Chat.
         */
        attribution: messageCauseAttributionSchema,
        /** The Trigger or Reminder id. */
        automationId: idSchema,
        /** When the answered fire happened. */
        firedAt: timestampSchema,
        /** The exact fire the Agent answered. */
        fireId: idSchema,
        kind: messageCauseKindSchema,
        live: messageCauseLiveSchema.nullable(),
        ownerAgentId: idSchema,
        /** A Reminder's cadence ("Every Monday at 09:00") or a Trigger's kind label ("Webhook"). */
        summary: z.string().min(1),
        title: z.string().min(1),
    })
    .strict();

export type MessageCause = z.infer<typeof messageCauseSchema>;

export const automationFireContextInputSchema = z
    .object({ messageId: idSchema, serverId: idSchema })
    .strict();

export type AutomationFireContextInput = z.infer<typeof automationFireContextInputSchema>;

/**
 * The Thread pane's context card for one caused message. Kind-specific fields
 * are null for the other kind: `payload`, `payloadBytes`, and `contentType`
 * belong to a Trigger fire; `repeat`, `nextFireAt`, `anchorMessageId`, and
 * `anchorExcerpt` belong to a Reminder fire.
 */
export const automationFireContextSchema = z
    .object({
        anchorChatId: idSchema,
        anchorExcerpt: z.string().max(automationSnippetMaxChars).nullable(),
        anchorMessageId: idSchema.nullable(),
        cause: messageCauseSchema,
        contentType: z.string().nullable(),
        firedAt: timestampSchema,
        /** This fire's position in the automation's history, 1-based. Null once archived. */
        fireOrdinal: z.number().int().positive().nullable(),
        fireTotal: z.number().int().positive().nullable(),
        nextFireAt: timestampSchema.nullable(),
        payload: z.string().max(automationPayloadExcerptMaxChars).nullable(),
        payloadBytes: z.number().int().nonnegative().nullable(),
        payloadTruncated: z.boolean(),
        repeat: z.string().nullable(),
    })
    .strict();

export type AutomationFireContext = z.infer<typeof automationFireContextSchema>;

/**
 * One typed delivery served on `haus message check` that has no chat message
 * of its own: a Trigger or Reminder fire, or a task assignment. It cannot ride
 * the message array of `/api/agent/events`, so it carries its own envelope body
 * plus the identity the Agent CLI needs to render the same
 * `[target=… msg=… time=… type=…]` header the launch drain uses.
 */
export const agentAutomationEventSchema = z
    .object({
        content: z.string(),
        createdAt: timestampSchema,
        /** The fire id (`trf_…` or `rmf_…`) or assignment key. Fires render `msg=-`; an assignment renders its task message id. */
        id: idSchema,
        senderHandle: z.enum(['haus', 'reminder', 'trigger']),
        senderType: z.enum(['system', 'trigger']),
        target: z.string().min(1),
    })
    .strict();

export type AgentAutomationEvent = z.infer<typeof agentAutomationEventSchema>;
