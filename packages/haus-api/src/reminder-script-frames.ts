import * as z from 'zod';
import { idSchema } from './chat.ts';

/** Runs one persisted reminder script inside the owning Agent's Computer workspace. */
export const reminderScriptCommandSchema = z
    .object({
        agentId: idSchema,
        attentionId: idSchema,
        fireId: idSchema,
        reminderId: idSchema,
        script: z.string().min(1).max(16_384),
        type: z.literal('reminder-script'),
    })
    .strict();

export type ReminderScriptCommand = z.infer<typeof reminderScriptCommandSchema>;

/** Idempotent Computer result for one reminder script attention row. */
export const reminderScriptResultSchema = z
    .object({
        agentId: idSchema,
        attentionId: idSchema,
        /** Optional so an older Computer's result is still accepted without it. */
        durationMs: z.number().int().nonnegative().optional(),
        exitCode: z.number().int(),
        fireId: idSchema,
        output: z.string().max(65_536),
        timedOut: z.boolean(),
        type: z.literal('reminder-script-result'),
    })
    .strict();

export type ReminderScriptResult = z.infer<typeof reminderScriptResultSchema>;
