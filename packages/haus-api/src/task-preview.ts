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
 * `agentId` and `model` are the Task's own, so its agent's messages are named the way the
 * Task page names them; a Task agent is on no roster.
 */
export const taskPreviewSchema = z
    .object({
        agentId: idSchema.nullable(),
        archivedAt: timestampSchema.nullable(),
        chatId: idSchema,
        followed: z.boolean(),
        messageCount: z.number().int().nonnegative(),
        model: z.string().min(1).max(128).nullable(),
        originMessageId: idSchema,
        recentMessages: z.array(taskReplyPreviewSchema).max(taskPreviewRecentMessageLimit),
        shortId: taskShortIdSchema,
        taskId: idSchema,
        title: z.string().min(1),
        unreadCount: z.number().int().nonnegative(),
    })
    .strict();

export type TaskPreview = z.infer<typeof taskPreviewSchema>;
