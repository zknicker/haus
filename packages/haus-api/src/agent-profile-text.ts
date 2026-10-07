import * as z from 'zod';
import { normalizeReactionEmoji } from './reaction-emoji.ts';

/**
 * An Agent's description is its role line. It closes the Agent's own system prompt as
 * `## Initial role` and rides every message envelope it sends (`@name — <description>:`), so a
 * long one taxes every reader. Writes are capped here; stored rows written before the cap keep
 * the older 500-character read bound.
 */
export const AGENT_DESCRIPTION_MAX_LENGTH = 280;

/**
 * An Agent's conversation style: an optional voice and banter layer on top of the built-in house
 * personality, written by its Owners and Admins or by the Agent itself. Private: it reaches only
 * the Agent's own system prompt and its own `haus profile show`, never an envelope, roster, or
 * another Agent's view.
 */
export const AGENT_CONVERSATION_STYLE_MAX_LENGTH = 2000;

export const agentDescriptionTooLongMessage = `An Agent description is a one-or-two-sentence role line of at most ${AGENT_DESCRIPTION_MAX_LENGTH} characters.`;

/** The bound on stored descriptions, including rows written before the role-line cap. */
export const AGENT_DESCRIPTION_STORED_MAX_LENGTH = 500;

/** A description being created. Reads use the wider stored bound. */
export const agentDescriptionInputSchema = z
    .string()
    .trim()
    .min(1)
    .max(AGENT_DESCRIPTION_MAX_LENGTH, agentDescriptionTooLongMessage);

/**
 * A description on an update. Clients resend the stored value with every profile save, so the
 * schema admits the stored bound and the Server applies the role-line cap only to a changed value
 * (`isAgentDescriptionWriteAllowed`).
 */
export const agentDescriptionUpdateInputSchema = z
    .string()
    .trim()
    .min(1)
    .max(AGENT_DESCRIPTION_STORED_MAX_LENGTH, agentDescriptionTooLongMessage);

/** An unchanged description passes even when it predates the cap; a new one must fit it. */
export function isAgentDescriptionWriteAllowed(
    next: string | null,
    stored: string | null
): boolean {
    return next === null || next.length <= AGENT_DESCRIPTION_MAX_LENGTH || next === stored;
}

/** A conversation style being written; empty clears it. */
export const agentConversationStyleInputSchema = z
    .string()
    .trim()
    .max(
        AGENT_CONVERSATION_STYLE_MAX_LENGTH,
        `A conversation style is at most ${AGENT_CONVERSATION_STYLE_MAX_LENGTH} characters.`
    );

export const signatureEmojiRule =
    'A signature emoji must be exactly one emoji (a flag, skin tone, or combined emoji counts as one), not text.';

/** Matches the `agents_signature_emoji_length` check; one grapheme can still stack modifiers past it. */
export const AGENT_SIGNATURE_EMOJI_MAX_LENGTH = 64;

/**
 * The emoji an Agent reacts with when it picks up a non-trivial request. Stored fully qualified;
 * null means the Computer's default.
 */
export const signatureEmojiInputSchema = z.string().transform((value, context) => {
    const emoji = normalizeReactionEmoji(value);
    if (!emoji || emoji.length > AGENT_SIGNATURE_EMOJI_MAX_LENGTH) {
        context.addIssue({ code: 'custom', message: signatureEmojiRule });
        return z.NEVER;
    }
    return emoji;
});
