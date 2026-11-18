import * as z from 'zod';
import type { CodexAccessTokenMetadata } from './types.ts';

const codexAccessTokenClaimsSchema = z
    .object({
        'https://api.openai.com/auth': z
            .object({
                chatgpt_plan_type: z.string().trim().min(1).optional(),
            })
            .optional(),
        'https://api.openai.com/profile': z
            .object({
                email: z.string().trim().min(1).optional(),
            })
            .optional(),
    })
    .passthrough();

export function decodeCodexAccessTokenMetadata(
    accessToken: string
): CodexAccessTokenMetadata | null {
    const payload = accessToken.split('.')[1];
    if (!payload) {
        return null;
    }

    try {
        const parsed = codexAccessTokenClaimsSchema.parse(
            JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
        );

        const email = parsed['https://api.openai.com/profile']?.email ?? null;
        const planType = parsed['https://api.openai.com/auth']?.chatgpt_plan_type ?? null;

        if (!(email || planType)) {
            return null;
        }

        return {
            email,
            planType,
        };
    } catch {
        return null;
    }
}
