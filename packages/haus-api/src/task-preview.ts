import * as z from 'zod';

import { idSchema } from './chat-contract-primitives.ts';
import { taskKeySchema } from './task-key.ts';
import { taskReplyPreviewSchema } from './task-reply-preview.ts';
import { taskStateSchema } from './task-state.ts';

/** How many recent Task messages a Channel preview quotes. */
export const taskPreviewRecentMessageLimit = 3;

/**
 * A Task as its origin Channel previews it under the Message it started from
 * (ADR 0053 decision 7): its newest messages and the Task's state.
 * One origin Message can carry several. Rides `chat.messages` pages as `tasks`.
 */
export const taskPreviewSchema = z
    .object({
        chatId: idSchema,
        followed: z.boolean(),
        key: taskKeySchema,
        messageCount: z.number().int().nonnegative(),
        originMessageId: idSchema,
        recentMessages: z.array(taskReplyPreviewSchema).max(taskPreviewRecentMessageLimit),
        state: taskStateSchema,
        taskId: idSchema,
        title: z.string().min(1),
        unreadCount: z.number().int().nonnegative(),
    })
    .strict();

export type TaskPreview = z.infer<typeof taskPreviewSchema>;
