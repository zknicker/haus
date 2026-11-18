import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/**
 * One message as a Task preview quotes it. Authors stay as ids so every
 * surface names them through the Agent list and member directory.
 */
export const taskReplyPreviewSchema = z
    .object({
        authorAgentId: idSchema.nullable(),
        authorUserId: idSchema.nullable(),
        content: z.string(),
        createdAt: timestampSchema,
        id: idSchema,
    })
    .strict();

export type TaskReplyPreview = z.infer<typeof taskReplyPreviewSchema>;
