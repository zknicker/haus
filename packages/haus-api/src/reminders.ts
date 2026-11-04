import * as z from 'zod';
import { agentIdempotencyKeySchema } from './agent-idempotency.ts';
import { AUTOMATION_HISTORY_RETENTION_DAYS } from './automation.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * A Reminder's title is a short label, like a calendar invite subject; its
 * description says what to do when it fires. Writes enforce the title limit;
 * reads allow the older 300-character titles written before the split.
 */
export const REMINDER_TITLE_MAX_CHARS = 60;
export const REMINDER_DESCRIPTION_MAX_CHARS = 300;

/**
 * A wake rule's run outcome: see `decideReminderWake` in the Server for the
 * exact rules. `not_reported` is not a decision outcome — it is what a read
 * shows for a script fire the Computer has not settled yet, so every reader
 * (the CLI and the website) renders the same label instead of each guessing
 * from a bare null.
 */
export const reminderRunOutcomeSchema = z.enum([
    'failed',
    'not_reported',
    'quiet',
    'recovered',
    'unchanged',
    'woke',
]);

export type ReminderRunOutcome = z.infer<typeof reminderRunOutcomeSchema>;

/** `--fail-after N`: between 1 and 20 consecutive failures before waking once. */
export const REMINDER_FAIL_AFTER_MIN = 1;
export const REMINDER_FAIL_AFTER_MAX = 20;
const failAfterSchema = z.number().int().min(REMINDER_FAIL_AFTER_MIN).max(REMINDER_FAIL_AFTER_MAX);

export const reminderSchema = z
    .object({
        anchorChatId: idSchema,
        anchorMessageId: idSchema,
        createdAt: timestampSchema,
        /** Null when the author gave none. Command snapshots before the split omit it. */
        description: z.string().min(1).max(REMINDER_DESCRIPTION_MAX_CHARS).nullable().default(null),
        /** Pre-wake-rules reads default to disabled. */
        failAfter: failAfterSchema.nullable().default(null),
        fireAt: timestampSchema,
        hasScript: z.boolean(),
        id: idSchema,
        ownerAgentId: idSchema,
        ownerHandle: z.string().min(1),
        repeat: z.string().min(1).nullable(),
        scriptBytes: z.number().int().nonnegative().max(16_384),
        status: z.enum(['canceled', 'fired', 'scheduled']),
        timezone: z.string().min(1),
        title: z.string().min(1).max(300),
        updatedAt: timestampSchema,
        version: z.number().int().positive(),
        /** Pre-wake-rules reads default to disabled. */
        wakeOnChange: z.boolean().default(false),
    })
    .strict();

export type Reminder = z.infer<typeof reminderSchema>;

/**
 * Reminder fires are history, not schedule. Server deletes a fire this many
 * days after it happened, and deletes fired one-shot and canceled reminders
 * this many days after they settled.
 */
export const REMINDER_HISTORY_RETENTION_DAYS = AUTOMATION_HISTORY_RETENTION_DAYS;

export const reminderListInputSchema = z
    .object({
        agentId: idSchema.optional(),
        serverId: idSchema,
        status: z.enum(['canceled', 'fired', 'scheduled']).optional(),
    })
    .strict();

export const reminderListSchema = z.array(reminderSchema);

export const reminderRunsInputSchema = z
    .object({
        reminderId: idSchema,
        serverId: idSchema,
    })
    .strict();

export const reminderFireSchema = z
    .object({
        /** Script run duration; null for a reminder with no script. */
        durationMs: z.number().int().nonnegative().nullable().default(null),
        firedAt: timestampSchema,
        id: idSchema,
        /** `not_reported` until a script fire settles; always `woke` for a reminder with no script. */
        outcome: reminderRunOutcomeSchema.nullable().default(null),
        reminderId: idSchema,
        scheduledFor: timestampSchema,
        /** Null for a reminder with no script. */
        scriptExitCode: z.number().int().nullable().default(null),
        /** Tokens the woken turn reported; null when it wasn't a wake or usage wasn't reported. */
        wakeTotalTokens: z.number().int().nonnegative().nullable().default(null),
    })
    .strict();

export const reminderRunsSchema = z.array(reminderFireSchema);

export const reminderHistoryInputSchema = z
    .object({
        agentId: idSchema,
        limit: z.number().int().min(1).max(500).default(200),
        serverId: idSchema,
    })
    .strict();

/**
 * One execution of a reminder, as shown in the Agent profile's History drawer.
 * Recurring reminders contribute one entry per fire. Entries live for
 * `REMINDER_HISTORY_RETENTION_DAYS` and then Server deletes them.
 */
export const reminderHistoryEntrySchema = z
    .object({
        /** The Agent's marked answer to this fire, when it has posted one. */
        answer: z.object({ chatId: idSchema, messageId: idSchema }).strict().nullable(),
        fireId: idSchema,
        firedAt: timestampSchema,
        reminderId: idSchema,
        /** The reminder's cadence at read time; null for a one-shot. */
        repeat: z.string().min(1).nullable(),
        scheduledFor: timestampSchema,
        /** Null when the reminder carried no script. */
        script: z
            .object({
                durationMs: z.number().int().nonnegative().nullable().default(null),
                exitCode: z.number().int().nullable(),
                /** `not_reported` until the fire settles. */
                outcome: reminderRunOutcomeSchema.nullable().default(null),
                timedOut: z.boolean(),
            })
            .strict()
            .nullable(),
        title: z.string().min(1).max(300),
    })
    .strict();

export type ReminderHistoryEntry = z.infer<typeof reminderHistoryEntrySchema>;

/** Newest fire first. */
export const reminderHistorySchema = z.array(reminderHistoryEntrySchema);

export const reminderCancelInputSchema = z
    .object({
        commandId: z.string().trim().min(1).max(128),
        expectedVersion: z.number().int().positive(),
        reminderId: idSchema,
        serverId: idSchema,
    })
    .strict();

/**
 * `haus reminder schedule` behind the loopback proxy. `commandId` is the
 * idempotency key, scoped to the authoring Agent: the same key and input replay
 * the first result. Title and description lengths are checked by the reminder
 * model, whose error teaches the Agent the format. A calendar repeat (`daily@`,
 * `weekly:`) requires `timezone` and may omit `fireAt`: the Server derives the
 * next slot, and refuses a supplied first fire that is not on one.
 */
export const agentReminderScheduleInputSchema = z
    .object({
        commandId: agentIdempotencyKeySchema,
        description: z.string().min(1).optional(),
        /** Opt-in: wake once on the Nth consecutive script failure, then quiet until it wakes again. */
        failAfter: failAfterSchema.optional(),
        fireAt: z.iso.datetime().optional(),
        messageId: z.string().min(1),
        repeat: z.string().min(1).optional(),
        script: z.string().min(1).optional(),
        title: z.string().min(1),
        timezone: z.string().min(1).optional(),
        /** Opt-in: a waking output equal to the last one that woke the Agent is a quiet tick. */
        wakeOnChange: z.boolean().optional(),
    })
    .strict();

/** The optimistic, idempotent envelope every Agent reminder change carries. */
export const agentReminderCommandSchema = z
    .object({
        commandId: agentIdempotencyKeySchema,
        expectedVersion: z.number().int().positive(),
        id: z.string().min(1),
    })
    .strict();

export const reminderMutationResultSchema = z
    .object({
        idempotent: z.boolean(),
        reminder: reminderSchema,
    })
    .strict();

/**
 * `reminder.onUpdated`: a reminder was scheduled, updated, snoozed, canceled,
 * or fired. Owner/Admin only, like the reminder reads; every delivery rechecks
 * that authority. Names the owning Agent so the App invalidates exactly its
 * reminder list, runs, and history reads.
 */
export const reminderUpdatedEventSchema = z
    .object({
        action: z.enum(['canceled', 'fired', 'scheduled', 'snoozed', 'updated']),
        ownerAgentId: idSchema,
        reminderId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type ReminderUpdatedEvent = z.infer<typeof reminderUpdatedEventSchema>;
