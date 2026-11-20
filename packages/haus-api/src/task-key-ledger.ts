import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/**
 * The Server's ledger of Task keys (ADR 0053 decision 11). Each entry is a
 * prefix like `SEC`, numbered on its own. Each Project holds exactly one entry
 * (specs/projects.md). A Task takes its Project's entry and keeps it.
 */
export const TASK_KEY_PREFIX_PATTERN = /^[A-Z][A-Z0-9]{1,4}$/u;

/** The key every Server starts with, held by the Haus project. */
export const GENERAL_TASK_KEY = 'GEN';

export const taskKeyPrefixSchema = z.string().trim().regex(TASK_KEY_PREFIX_PATTERN, {
    message: 'A key is 2 to 5 capital letters or digits, starting with a letter, like SEC.',
});

export const taskKeyLedgerEntrySchema = z
    .object({
        createdAt: timestampSchema,
        id: idSchema,
        key: taskKeyPrefixSchema,
        nextNumber: z.number().int().positive(),
        serverId: idSchema,
    })
    .strict();

export type TaskKeyLedgerEntry = z.infer<typeof taskKeyLedgerEntrySchema>;

/** `taskKey.list`: every ledger entry on the Server, by key. */
export const taskKeyListInputSchema = z.object({ serverId: idSchema }).strict();

export const taskKeyListSchema = z.array(taskKeyLedgerEntrySchema);

export type TaskKeyListInput = z.infer<typeof taskKeyListInputSchema>;
