import * as z from 'zod';
import {
    AGENT_DESCRIPTION_STORED_MAX_LENGTH,
    AGENT_PERSONALITY_MAX_LENGTH,
    agentDescriptionTooLongMessage,
    agentPersonalityInputSchema,
} from './agent-profile-text.ts';
import { idSchema } from './chat.ts';

/**
 * The identity a human edits on the Agent profile. `personality` is optional so a client that
 * does not edit it leaves it unchanged; `null` or empty clears it. The description admits the
 * stored bound because clients resend it unchanged; the Server caps only a changed one.
 */
export const updateAgentProfileInputSchema = z
    .object({
        agentId: idSchema,
        description: z
            .string()
            .trim()
            .max(AGENT_DESCRIPTION_STORED_MAX_LENGTH, agentDescriptionTooLongMessage)
            .nullable(),
        displayName: z.string().trim().min(1).max(80),
        personality: agentPersonalityInputSchema.nullable().optional(),
        serverId: idSchema,
    })
    .strict();

export type UpdateAgentProfileInput = z.infer<typeof updateAgentProfileInputSchema>;

/** Owner/Admin-only read: the personality stays off the member-wide Agent record. */
export const agentPersonalitySchema = z
    .object({ personality: z.string().max(AGENT_PERSONALITY_MAX_LENGTH).nullable() })
    .strict();

export type AgentPersonality = z.infer<typeof agentPersonalitySchema>;
