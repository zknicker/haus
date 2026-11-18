import * as z from 'zod';

export function createChatMessageReceipts<T extends z.ZodType>(message: T) {
    return {
        message: z
            .object({
                idempotent: z.boolean(),
                message,
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
