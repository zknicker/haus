import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { taskReplyPreviewSchema } from './task-reply-preview.ts';
import { taskShortIdSchema } from './task-short-id.ts';

/** How many recent Task messages a Channel preview quotes. */
export const taskPreviewRecentMessageLimit = 3;

/**
 * A Task as its origin Channel previews it under the Message it started from
 * (ADR 0053 decision 7): its newest messages and whether it is archived.
 * One origin Message can carry several. Rides `chat.messages` pages as `tasks`.
 */
export const taskPreviewSchema = z
    .object({
        archivedAt: timestampSchema.nullable(),
        chatId: idSchema,
        followed: z.boolean(),
        messageCount: z.number().int().nonnegative(),
        originMessageId: idSchema,
        recentMessages: z.array(taskReplyPreviewSchema).max(taskPreviewRecentMessageLimit),
        shortId: taskShortIdSchema,
        taskId: idSchema,
        title: z.string().min(1),
        unreadCount: z.number().int().nonnegative(),
    })
    .strict();

export type TaskPreview = z.infer<typeof taskPreviewSchema>;
