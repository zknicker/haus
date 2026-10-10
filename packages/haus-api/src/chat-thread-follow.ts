import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

export const threadFollowInputSchema = z
    .object({
        follow: z.boolean(),
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();

export const threadContextInputSchema = z
    .object({
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();

export const threadContextSchema = z
    .object({
        anchorMessageId: idSchema,
        parentChatId: idSchema,
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();

export const threadFollowReceiptSchema = z
    .object({
        followed: z.boolean(),
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();
