import type { ChatEngagement, ChatEngagementEvent, ChatMessage } from '@haus/api';
import {
    type ChatTypingFace,
    chatTypingReadFace,
    chatTypingSentFace,
} from './chat-typing-launch.ts';

/**
 * A `--done` reply ends engagement live, but its message reaches the
 * transcript cache after the Chat lane's batch and refetch (ADR 0035), up to a
 * second later. The strip keeps that Agent's dots until the reply is there, and
 * gives up after this long.
 */
export const chatTypingReplyHoldMs = 2000;
/** The reply commits just before its end is announced; older posts of the run are interim. */
const replyCommitWindowMs = 2000;

export type ChatEngagementEnd = Extract<ChatEngagementEvent, { type: 'chat.engagement.ended' }>;
type TranscriptMessage = Pick<ChatMessage, 'author' | 'createdAt' | 'runId'>;

/** One Agent kept in the strip after its engagement ended, until its reply shows. */
export interface ChatTypingHold {
    end: ChatEngagementEnd;
    expiresAt: number;
}

export type ChatTypingEndOutcome =
    | { face: ChatTypingFace; kind: 'face' }
    | { hold: ChatTypingHold; kind: 'hold' }
    | { kind: 'none' };

/**
 * What an ended engagement shows: a reply already in the transcript launches
 * 😊 at once, a reply still on its way holds the dots, and a run that settled
 * without writing here launches 👀 ("read it, nothing to add"). A run that
 * settled after writing without `--done`, or was interrupted, launches nothing;
 * failures already launched their own face from activity.
 */
export function resolveChatTypingEnd(
    end: ChatEngagementEnd,
    messages: readonly TranscriptMessage[],
    now: number
): ChatTypingEndOutcome {
    if (end.reason === 'sent') {
        return isReplyVisible(end, messages)
            ? { face: chatTypingSentFace, kind: 'face' }
            : { hold: { end, expiresAt: now + chatTypingReplyHoldMs }, kind: 'hold' };
    }
    if (end.reason === 'settled' && !messages.some((message) => isRunMessage(end, message))) {
        return { face: chatTypingReadFace, kind: 'face' };
    }
    return { kind: 'none' };
}

/** Splits holds into those still waiting and those whose reply arrived or whose time ran out. */
export function releaseChatTypingHolds(
    holds: readonly ChatTypingHold[],
    messages: readonly TranscriptMessage[],
    now: number
): { kept: ChatTypingHold[]; released: ChatTypingHold[] } {
    const kept: ChatTypingHold[] = [];
    const released: ChatTypingHold[] = [];
    for (const hold of holds) {
        const done = now >= hold.expiresAt || isReplyVisible(hold.end, messages);
        (done ? released : kept).push(hold);
    }
    return { kept, released };
}

/** The live engagements plus held Agents, each run once, live ones first. */
export function withHeldEngagements(
    engagements: readonly ChatEngagement[],
    holds: readonly ChatTypingHold[]
): readonly ChatEngagement[] {
    const held = holds
        .filter(
            ({ end }) =>
                !engagements.some(
                    (engagement) =>
                        engagement.agentId === end.agentId && engagement.runId === end.runId
                )
        )
        .map(({ end }) => ({
            agentId: end.agentId,
            chatId: end.chatId,
            runId: end.runId,
            startedAt: end.emittedAt,
        }));
    return held.length > 0 ? [...engagements, ...held] : engagements;
}

function isReplyVisible(end: ChatEngagementEnd, messages: readonly TranscriptMessage[]) {
    const earliest = Date.parse(end.emittedAt) - replyCommitWindowMs;
    return messages.some(
        (message) => isRunMessage(end, message) && Date.parse(message.createdAt) >= earliest
    );
}

function isRunMessage(end: ChatEngagementEnd, message: TranscriptMessage) {
    return (
        message.runId === end.runId &&
        message.author.kind === 'agent' &&
        message.author.agentId === end.agentId
    );
}
