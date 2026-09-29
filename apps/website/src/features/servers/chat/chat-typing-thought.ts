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
export const chatTypingThoughtTiming = { enterMs: 620, exitMs: 260 } as const;

/** The shortest and longest hold, whatever the line's length. */
export const chatTypingThoughtHoldRangeMs = { max: 7500, min: 5000 } as const;

/**
 * How long a bubble holds after it wobbles in. The Server shows few bubbles —
 * one per workstream or finding, or a "still" line after a quiet stretch — so
 * each can stay until someone glancing up has read it: about 3.5 seconds to
 * notice the bubble and move the eyes there, plus 350ms a word (a relaxed
 * glance-reading pace), between 5 and 7.5 seconds. An eight-word line holds
 * about 6.3 seconds.
 */
export function chatTypingThoughtHoldMs(text: string): number {
    const words = text.split(/\s+/u).filter(Boolean).length;
    return Math.min(
        chatTypingThoughtHoldRangeMs.max,
        Math.max(chatTypingThoughtHoldRangeMs.min, 3500 + 350 * words)
    );
}

/**
 * However often its line repeats, a bubble stays on screen at most this long
 * from when it appeared, so a run stuck on one line still lets the bubble go:
 * about two holds' worth, long enough to read as "still on it", short enough
 * that the strip never looks frozen.
 */
export const chatTypingThoughtMaxVisibleMs = 12_000;

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
        now + chatTypingThoughtHoldMs(next.text),
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
 * Bubbles start at least this far apart, so a newer one never cuts the last
 * short before its shortest hold. The Server already spaces a request's
 * bubbles ten seconds or more, so this rarely delays one; it guards against
 * summaries that land close together, as when two Agents think at once. A
 * thought that comes early waits, and a newer one replaces it while it waits.
 */
export const chatTypingThoughtSpacingMs = chatTypingThoughtHoldRangeMs.min;

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

/**
 * A strip's thoughts: `live` is the bubble on its own beat; `latest` is the
 * last bubble this engagement showed, kept after it leaves so hovering the
 * Agent's avatar or dots can bring it back. Both clear when the run stops
 * engaging the Chat, so a new turn never recalls an old one.
 */
export interface ChatTypingThoughts {
    latest: ChatTypingThought | null;
    live: ChatTypingThought | null;
}

/** After the pointer leaves, a recalled bubble lingers this long before its exit. */
export const chatTypingThoughtRecallLingerMs = 300;

/**
 * The bubble to render. A live bubble always shows; while recalled, the
 * latest one shows too. The latest is the live one when both exist, so a hover
 * over a live bubble keeps its key and simply holds it past its own hold.
 */
export function shownChatTypingThought(
    thoughts: ChatTypingThoughts,
    recalled: boolean
): ChatTypingThought | null {
    return thoughts.live ?? (recalled ? thoughts.latest : null);
}
