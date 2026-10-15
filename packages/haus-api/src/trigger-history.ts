import * as z from 'zod';
import { AUTOMATION_HISTORY_RETENTION_DAYS } from './automation.ts';
import { idSchema } from './chat.ts';
import { triggerTitleMaxLength } from './triggers.ts';

// The Agent profile's Trigger fire history.

const timestampSchema = z.iso.datetime({ offset: true });

/** Agent-profile history page size and shared fire-history retention window. */
export const TRIGGER_HISTORY_LIMIT_DEFAULT = 200;
export const TRIGGER_HISTORY_LIMIT_MAX = 500;
export const TRIGGER_HISTORY_RETENTION_DAYS = AUTOMATION_HISTORY_RETENTION_DAYS;

export const triggerHistoryInputSchema = z
    .object({
        agentId: idSchema,
        limit: z
            .number()
            .int()
            .min(1)
            .max(TRIGGER_HISTORY_LIMIT_MAX)
            .default(TRIGGER_HISTORY_LIMIT_DEFAULT),
        serverId: idSchema,
    })
    .strict();

/** One retained Trigger fire as shown in the Agent profile history drawer. */
export const triggerHistoryEntrySchema = z
    .object({
        /** The Agent's marked answer to this fire, when it has posted one. */
        answer: z.object({ chatId: idSchema, messageId: idSchema }).strict().nullable(),
        contentType: z.string().nullable(),
        dedupeKey: z.string().nullable(),
        fireId: idSchema,
        firedAt: timestampSchema,
        payloadBytes: z.number().int().nonnegative(),
        /** Non-null while the retained Trigger is a deletion tombstone. */
        triggerDeletedAt: timestampSchema.nullable(),
        title: z.string().min(1).max(triggerTitleMaxLength),
        triggerId: idSchema,
    })
    .strict();

export type TriggerHistoryEntry = z.infer<typeof triggerHistoryEntrySchema>;

export const triggerHistorySchema = z.array(triggerHistoryEntrySchema);
