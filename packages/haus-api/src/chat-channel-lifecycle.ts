import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

export const channelLifecycleInputSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();

export const channelLifecycleReceiptSchema = z
    .object({
        archivedAt: timestampSchema.nullable(),
        chatId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type ChannelLifecycleReceipt = z.infer<typeof channelLifecycleReceiptSchema>;

export const channelDeleteInputSchema = channelLifecycleInputSchema
    .extend({ confirmation: z.string().trim().min(1).max(32) })
    .strict();

export const channelDeleteReceiptSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();

export type ChannelDeleteReceipt = z.infer<typeof channelDeleteReceiptSchema>;
