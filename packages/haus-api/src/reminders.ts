import * as z from 'zod';
import { AUTOMATION_HISTORY_RETENTION_DAYS } from './automation.ts';
import { idSchema, reminderChangedEventSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * A Reminder's title is a short label, like a calendar invite subject; its
 * description says what to do when it fires. Writes enforce the title limit;
 * reads allow the older 300-character titles written before the split.
 */
export const REMINDER_TITLE_MAX_CHARS = 60;
export const REMINDER_DESCRIPTION_MAX_CHARS = 300;

export const reminderSchema = z
    .object({
        anchorChatId: idSchema,
        anchorMessageId: idSchema,
        createdAt: timestampSchema,
        /** Null when the author gave none. Command snapshots before the split omit it. */
        description: z.string().min(1).max(REMINDER_DESCRIPTION_MAX_CHARS).nullable().default(null),
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
        firedAt: timestampSchema,
        id: idSchema,
        reminderId: idSchema,
        scheduledFor: timestampSchema,
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
                exitCode: z.number().int().nullable(),
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

export const reminderMutationResultSchema = z
    .object({
        idempotent: z.boolean(),
        reminder: reminderSchema,
    })
    .strict();

export const reminderChangesInputSchema = z
    .object({
        afterCursor: z.string().regex(/^\d+$/u).default('0'),
        limit: z.number().int().min(1).max(500).default(100),
        serverId: idSchema,
    })
    .strict();

export const reminderChangesSchema = z.array(reminderChangedEventSchema);

export const reminderEventSubscriptionInputSchema = z.object({ serverId: idSchema }).strict();
