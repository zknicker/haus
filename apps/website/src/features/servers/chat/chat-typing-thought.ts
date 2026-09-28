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
 * However often its line repeats, a bubble stays on screen at most this long
 * from when it appeared, so a run stuck on one line still lets the bubble go:
 * about three holds' worth, long enough to read as "still on it", short enough
 * that the strip never looks frozen.
 */
export const chatTypingThoughtMaxVisibleMs = 8000;

/** The bubble on screen: when it appeared and when its hold ends. */
export interface ChatTypingThoughtOnScreen {
    hideAt: number;
    shownAt: number;
    thought: ChatTypingThought;
}

/**
 * What an arriving thought does. The same line from the same run while its
 * bubble is still up extends that bubble's hold, reset from now and capped at
 * the maximum visible time, without a new bubble or its wobble; once the cap
 * leaves nothing to add, the repeat is absorbed. Anything else, including the
 * same line after its bubble has left, is a new bubble.
 */
export type ChatTypingThoughtArrival =
    | { hideAt: number; kind: 'extend' }
    | { kind: 'absorb' }
    | { kind: 'show' };

export function resolveChatTypingThoughtArrival(
    onScreen: ChatTypingThoughtOnScreen | null,
    next: Pick<ChatTypingThought, 'agentId' | 'runId' | 'text'>,
    now: number
): ChatTypingThoughtArrival {
    if (
        !onScreen ||
        onScreen.thought.agentId !== next.agentId ||
        onScreen.thought.runId !== next.runId ||
        normalizeChatTypingThoughtText(onScreen.thought.text) !==
            normalizeChatTypingThoughtText(next.text)
    ) {
        return { kind: 'show' };
    }
    const hideAt = Math.min(
        now + chatTypingThoughtTiming.holdMs,
        onScreen.shownAt + chatTypingThoughtMaxVisibleMs
    );
    return hideAt > onScreen.hideAt ? { hideAt, kind: 'extend' } : { kind: 'absorb' };
}

/** A line's words for comparison: case, punctuation, and spacing ignored. */
export function normalizeChatTypingThoughtText(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/gu, ' ')
        .trim();
}

/**
 * Bubbles start at least this far apart. Thoughts arrive after a variable
 * summarizer delay, so the Computer's four-second spacing alone can reach the
 * screen closer together; a thought that comes early waits, and a newer one
 * replaces it while it waits.
 */
export const chatTypingThoughtSpacingMs = 4000;

/**
 * How long a new thought waits before its bubble may show. An engagement's
 * first thought never waits, so a bubble appears early in every turn even
 * while another Agent's bubble has just shown.
 */
export function chatTypingThoughtDelay(
    lastShownAt: number | null,
    now: number,
    firstOfEngagement = false
): number {
    return lastShownAt === null || firstOfEngagement
        ? 0
        : Math.max(0, lastShownAt + chatTypingThoughtSpacingMs - now);
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
