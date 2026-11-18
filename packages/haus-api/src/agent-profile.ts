import * as z from 'zod';
import {
    AGENT_CONVERSATION_STYLE_MAX_LENGTH,
    AGENT_DESCRIPTION_STORED_MAX_LENGTH,
    agentConversationStyleInputSchema,
    agentDescriptionTooLongMessage,
    agentDescriptionUpdateInputSchema,
    signatureEmojiInputSchema,
} from './agent-profile-text.ts';
import { idSchema } from './chat.ts';

/**
 * The identity a human edits on the Agent profile. The description admits the stored bound
 * because clients resend it unchanged; the Server caps only a changed one. Conversation style and
 * signature emoji have their own pair (`agent.conversationStyle`, `agent.updateConversationStyle`).
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
        serverId: idSchema,
    })
    .strict();

export type UpdateAgentProfileInput = z.infer<typeof updateAgentProfileInputSchema>;

/**
 * The Agent's private voice layer and pickup reaction. Owners, Admins, and the Agent itself read
 * it; it stays off the member-wide Agent record and every other Agent's view.
 */
export const agentConversationStyleSchema = z
    .object({
        conversationStyle: z.string().max(AGENT_CONVERSATION_STYLE_MAX_LENGTH).nullable(),
        signatureEmoji: z.string().min(1).max(64).nullable(),
    })
    .strict();

export type AgentConversationStyle = z.infer<typeof agentConversationStyleSchema>;

/** Absent leaves a field alone; null (or a blank style) clears it. */
const conversationStyleChangeShape = {
    conversationStyle: agentConversationStyleInputSchema.nullable().optional(),
    signatureEmoji: signatureEmojiInputSchema.nullable().optional(),
};

/** Owner/Admin write of any Agent's conversation style and signature emoji. */
export const updateAgentConversationStyleInputSchema = z
    .object({ agentId: idSchema, serverId: idSchema, ...conversationStyleChangeShape })
    .strict();

export type UpdateAgentConversationStyleInput = z.infer<
    typeof updateAgentConversationStyleInputSchema
>;

/**
 * An Agent's write of its own profile over the Agent API (`haus profile update`). It names no
 * target, so an Agent can only ever change itself.
 */
export const agentSelfProfileUpdateInputSchema = z
    .object({
        description: agentDescriptionUpdateInputSchema.optional(),
        ...conversationStyleChangeShape,
    })
    .strict()
    .refine(
        (input) =>
            input.description !== undefined ||
            input.conversationStyle !== undefined ||
            input.signatureEmoji !== undefined,
        { message: 'Change at least one of description, conversationStyle, or signatureEmoji.' }
    );

export type AgentSelfProfileUpdateInput = z.infer<typeof agentSelfProfileUpdateInputSchema>;
