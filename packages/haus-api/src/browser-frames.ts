import * as z from 'zod';
import { idSchema } from './chat.ts';
import {
    agentRuntimeBrowserSettingsSchema,
    agentRuntimeSaveBrowserSettingsSchema,
} from './runtime/contracts.ts';
import { traceCarrierSchema } from './trace-context.ts';

/**
 * Authenticated Browser request for one Computer attachment. Connection settings
 * go through Server; the App never accesses the Computer socket.
 */
export const browserRequestSchema = z
    .object({
        operation: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('get') }).strict(),
            z
                .object({
                    input: agentRuntimeSaveBrowserSettingsSchema,
                    kind: z.literal('save'),
                })
                .strict(),
        ]),
        requestId: idSchema,
        traceContext: traceCarrierSchema.optional(),
        type: z.literal('browser-request'),
    })
    .strict();

export type BrowserRequest = z.infer<typeof browserRequestSchema>;

export const browserResultSchema = z
    .object({
        error: z.string().trim().min(1).max(500).optional(),
        requestId: idSchema,
        result: z
            .object({
                kind: z.literal('settings'),
                value: agentRuntimeBrowserSettingsSchema,
            })
            .strict()
            .optional(),
        type: z.literal('browser-result'),
    })
    .strict()
    .refine((value) => Boolean(value.error) !== Boolean(value.result));

export type BrowserResult = z.infer<typeof browserResultSchema>;
