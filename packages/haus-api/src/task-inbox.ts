import * as z from 'zod';
import { boardNameSchema } from './board.ts';
import { chatMessageSchema } from './chat.ts';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { taskSchema } from './task.ts';

/**
 * One Task assigned to the reader, as a person's Inbox item (ADR 0051): one
 * per Task, never bundled. `contextMessage` is the newest message referencing
 * the Task that the reader can read, and the item's composer replies in a
 * Thread on it; null when there is none.
 */
export const taskInboxItemSchema = z
    .object({
        assignedAt: timestampSchema,
        assignedBy: z
            .object({
                id: idSchema,
                kind: z.enum(['user', 'agent']),
                label: z.string().min(1),
            })
            .strict(),
        boardName: boardNameSchema,
        contextMessage: chatMessageSchema.nullable(),
        task: taskSchema,
    })
    .strict();

export type TaskInboxItem = z.infer<typeof taskInboxItemSchema>;

/** `taskInbox.list`: the reader's uncleared Task items on one Server, newest assignment first. */
export const taskInboxListInputSchema = z.object({ serverId: idSchema }).strict();

export const taskInboxListSchema = z
    .object({
        items: z.array(taskInboxItemSchema),
    })
    .strict();

/** `taskInbox.clear`: Mark read, or opening the Task. Clearing a cleared item changes nothing. */
export const taskInboxClearInputSchema = z
    .object({
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

/** `taskInbox.restore`: undo a clear, for the App's Undo. */
export const taskInboxRestoreInputSchema = taskInboxClearInputSchema;

export const taskInboxMutationResultSchema = z
    .object({
        /** False when the item was already in the requested state, or is gone. */
        changed: z.boolean(),
    })
    .strict();

/**
 * `taskInbox.onChanged`: the reader's Task items changed (assigned, cleared,
 * restored, or withdrawn). Delivered only to `userId`. The App invalidates
 * `taskInbox.list` and the Inbox badge.
 */
export const taskInboxChangedEventSchema = z
    .object({
        serverId: idSchema,
        userId: idSchema,
    })
    .strict();

export type TaskInboxList = z.infer<typeof taskInboxListSchema>;
export type TaskInboxListInput = z.infer<typeof taskInboxListInputSchema>;
export type TaskInboxClearInput = z.infer<typeof taskInboxClearInputSchema>;
export type TaskInboxRestoreInput = z.infer<typeof taskInboxRestoreInputSchema>;
export type TaskInboxMutationResult = z.infer<typeof taskInboxMutationResultSchema>;
export type TaskInboxChangedEvent = z.infer<typeof taskInboxChangedEventSchema>;
