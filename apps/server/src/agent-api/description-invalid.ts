import { AGENT_DESCRIPTION_MAX_LENGTH } from '@haus/api';
import type * as z from 'zod';

/**
 * The refusal an Agent sees when its description write is too long. A description rides every
 * message the Agent sends, so the fix is named outright instead of hiding behind a generic
 * invalid-request line; anything else falls back to the route's own message.
 */
export function describeInvalidAgentProfileWrite(error: z.ZodError, fallback: string): string {
    const tooLong = error.issues.some(
        (issue) => issue.path[0] === 'description' && issue.code === 'too_big'
    );
    return tooLong ? agentDescriptionTooLongRefusal : fallback;
}

export const agentDescriptionTooLongRefusal = `--description is limited to ${AGENT_DESCRIPTION_MAX_LENGTH} characters: write a one-or-two-sentence role line and put longer context in the standing brief.`;
