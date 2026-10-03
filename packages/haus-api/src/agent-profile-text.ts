import * as z from 'zod';

/**
 * An Agent's description is its role line. It closes the Agent's own system prompt as
 * `## Initial role` and rides every message envelope it sends (`@name — <description>:`), so a
 * long one taxes every reader. Writes are capped here; stored rows written before the cap keep
 * the older 500-character read bound.
 */
export const AGENT_DESCRIPTION_MAX_LENGTH = 280;

/**
 * How an Agent talks — tone, length, quirks — as its Owners and Admins set it. Private: it reaches
 * only the Agent's own system prompt (`## Personality`), never an envelope, roster, or Agent API.
 */
export const AGENT_PERSONALITY_MAX_LENGTH = 2000;

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

/** A personality being written; empty clears it. */
export const agentPersonalityInputSchema = z
    .string()
    .trim()
    .max(
        AGENT_PERSONALITY_MAX_LENGTH,
        `An Agent personality is at most ${AGENT_PERSONALITY_MAX_LENGTH} characters.`
    );
