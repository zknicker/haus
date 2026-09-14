import { z } from 'zod';
import { idSchema } from './chat.ts';
import { computerRuntimeSchema } from './computer-inventory.ts';

export const computerInventoryRefreshRequestSchema = z
    .object({
        requestId: idSchema,
        type: z.literal('inventory-refresh-request'),
    })
    .strict();

export const computerInventoryRefreshResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            requestId: idSchema,
            runtimes: z.array(computerRuntimeSchema).max(50),
            status: z.literal('refreshed'),
            type: z.literal('inventory-refresh-result'),
        })
        .strict(),
    z
        .object({
            error: z.string().min(1).max(500),
            requestId: idSchema,
            status: z.literal('failed'),
            type: z.literal('inventory-refresh-result'),
        })
        .strict(),
]);

export type ComputerInventoryRefreshResult = z.infer<typeof computerInventoryRefreshResultSchema>;
