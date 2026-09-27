import type { AgentThoughtEvent, ChatEngagement } from '@haus/api';
import { isEngagedActivity } from './chat-typing-launch.ts';

/** One thought bubble over the typing strip; `id` keys its enter and exit. */
export interface ChatTypingThought {
    agentId: string;
    id: number;
    runId: string;
    text: string;
}

/** Wobble in, hold, then wobble out; a newer thought replaces the current one at once. */
export const chatTypingThoughtTiming = { enterMs: 620, exitMs: 260, holdMs: 2300 } as const;

/**
 * Bubbles start at least this far apart. Thoughts arrive after a variable
 * summarizer delay, so the Computer's four-second spacing alone can reach the
 * screen closer together; a thought that comes early waits, and a newer one
 * replaces it while it waits.
 */
export const chatTypingThoughtSpacingMs = 4000;

/** How long a new thought waits before its bubble may show. */
export function chatTypingThoughtDelay(lastShownAt: number | null, now: number): number {
    return lastShownAt === null ? 0 : Math.max(0, lastShownAt + chatTypingThoughtSpacingMs - now);
}

/**
 * The bubble for a live thought, or null. Like activity faces, a thought shows
 * here only when its run is the one engaging this Chat, so an Agent thinking
 * about another conversation stays quiet in this one.
 */
export function resolveChatTypingThought(
    engagements: readonly Pick<ChatEngagement, 'agentId' | 'runId'>[],
    event: Pick<AgentThoughtEvent, 'agentId' | 'runId' | 'text'>,
    id: number
): ChatTypingThought | null {
    return isEngagedActivity(engagements, event)
        ? { agentId: event.agentId, id, runId: event.runId, text: event.text }
        : null;
}

/** A shown thought disappears as soon as its run stops engaging the Chat. */
export function visibleChatTypingThought(
    engagements: readonly Pick<ChatEngagement, 'agentId' | 'runId'>[],
    thought: ChatTypingThought | null
): ChatTypingThought | null {
    return thought && isEngagedActivity(engagements, thought) ? thought : null;
}
