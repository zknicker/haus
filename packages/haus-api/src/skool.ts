import * as z from 'zod';
import { idSchema } from './chat.ts';
import { mcpConnectionInputSchema } from './mcp.ts';

const headerValue = z
    .string()
    .min(1)
    .max(32_000)
    .regex(/^[\x20-\x7E]+$/u);
export const skoolSessionSchema = z
    .object({
        auth_token: headerValue,
        cookie_header: headerValue,
        waf_token: headerValue,
    })
    .strict();

export const skoolConnectSchema = z
    .object({
        serverId: idSchema,
        connectionId: mcpConnectionInputSchema.shape.connectionId.optional(),
        session: skoolSessionSchema,
    })
    .strict();

export type SkoolSession = z.infer<typeof skoolSessionSchema>;
