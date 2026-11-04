import * as z from 'zod';

/**
 * One Anthropic-hosted cloud environment Claude Cloud can run a session on
 * (`GET /v1/environment_providers`, `kind: "anthropic_cloud"`). Haus pins a
 * Computer's Claude launches to one of these by id so a launch never lands on
 * whichever environment Claude Code picks on its own.
 */
export const cloudAgentEnvironmentSchema = z
    .object({
        id: z.string().trim().min(1).max(200),
        name: z.string().trim().min(1).max(200),
    })
    .strict();

export type CloudAgentEnvironment = z.infer<typeof cloudAgentEnvironmentSchema>;
