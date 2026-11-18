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
        /** The Task's own Chat, which opens it. */
        chatId: idSchema,
        /** Whether the viewer follows the Task. */
        followed: z.boolean(),
        key: taskKeySchema,
        /** Messages in the Task's Chat. */
        messageCount: z.number().int().nonnegative(),
        /** The Channel Message the Task started from; the preview sits under it. */
        originMessageId: idSchema,
        /** The Task's newest messages, oldest first. */
        recentMessages: z.array(taskReplyPreviewSchema).max(taskPreviewRecentMessageLimit),
        state: taskStateSchema,
        taskId: idSchema,
        title: z.string().min(1),
        /** The viewer's unread messages in the Task; zero unless followed (decision 9). */
        unreadCount: z.number().int().nonnegative(),
    })
    .strict();

export type TaskPreview = z.infer<typeof taskPreviewSchema>;
