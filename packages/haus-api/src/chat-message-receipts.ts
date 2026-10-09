import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

export function createChatMessageReceipts<T extends z.ZodType>(message: T) {
    return {
        message: z
            .object({
                idempotent: z.boolean(),
                message,
                threadChatId: idSchema.nullable(),
            })
            .strict(),
        reaction: z
            .object({
                changed: z.boolean(),
                message,
            })
            .strict(),
    };
}
