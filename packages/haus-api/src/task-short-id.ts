import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * A Task's short id (ADR 0062 decision 2): 8 lowercase Crockford base32
 * characters, its own column, unique per Server. It names the Task in the CLI,
 * URLs, branches and commit trailers.
 */
export const TASK_SHORT_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const TASK_SHORT_ID_LENGTH = 8;
export const TASK_SHORT_ID_PATTERN = /^[0-9a-hjkmnp-tv-z]{8}$/u;

export const taskShortIdSchema = z.string().trim().regex(TASK_SHORT_ID_PATTERN, {
    message: 'A Task short id is 8 lowercase letters or digits, like k3mq7xta.',
});

/** A Task as an Agent or URL names it: its short id or its full `tsk_` id. */
export const taskRefSchema = z.string().trim().min(1).max(128);

export function isTaskShortId(value: string): boolean {
    return TASK_SHORT_ID_PATTERN.test(value);
}

/**
 * One Task reference in a message's content, resolved at write time: an
 * explicit `task://<taskId>` link. A message's `taskLinks` keep content order.
 * `text` is the exact matched substring, so the App renders a chip over it;
 * content itself never changes.
 */
export const taskLinkSchema = z
    .object({
        shortId: taskShortIdSchema,
        taskId: idSchema,
        text: z.string().min(1).max(500),
    })
    .strict();

export type TaskLink = z.infer<typeof taskLinkSchema>;
