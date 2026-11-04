import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * A Task's key, `SEC-12`: its board's key and its per-board number. Derived
 * when read and never stored, so re-keying a board re-keys its Tasks.
 */
export const TASK_KEY_PATTERN = /^([A-Z][A-Z0-9]{1,4})-([1-9][0-9]*)$/u;

export const taskKeySchema = z.string().trim().regex(TASK_KEY_PATTERN, {
    message: 'A task key is a board key and a number, like SEC-12.',
});

export function formatTaskKey(boardKey: string, number: number): string {
    return `${boardKey}-${number}`;
}

export function parseTaskKey(key: string): { boardKey: string; number: number } | null {
    const match = TASK_KEY_PATTERN.exec(key);
    if (!match) {
        return null;
    }
    const number = Number(match[2]);
    return Number.isSafeInteger(number) ? { boardKey: match[1], number } : null;
}

/**
 * One Task reference in a message's content, resolved at write time: an
 * explicit `task://<taskId>` link or a bare key. A message's `taskLinks` keep
 * content order. `text` is the exact matched substring, so the App renders a
 * chip over it; content itself never changes.
 */
export const taskLinkSchema = z
    .object({
        key: taskKeySchema,
        taskId: idSchema,
        text: z.string().min(1).max(500),
    })
    .strict();

export type TaskLink = z.infer<typeof taskLinkSchema>;
