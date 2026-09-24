import type { AgentActivityCategory, AgentActivityEvent, ChatEngagement } from '@haus/api';

/** A face that launches from the typing dots when an engaged Agent starts a kind of work. */
export type ChatTypingFace = '🤔' | '🧐' | '🤓' | '🫣' | '😤' | '🫡' | '🙂‍↕️' | '😯' | '😵‍💫' | '😊';

export const chatTypingFailedFace = '😵‍💫';
export const chatTypingSentFace = '😊';

const startedFaces: Partial<Record<AgentActivityCategory, ChatTypingFace>> = {
    browsing: '🫣',
    checking_messages: '😯',
    editing_files: '😤',
    reading_files: '🧐',
    running_command: '🫡',
    searching_web: '🤓',
    thinking: '🤔',
    using_tool: '🙂‍↕️',
};

/**
 * The face for one committed activity event, or null. Only a started kind of
 * work launches; any failure launches the dizzy face. Thought text never
 * reaches the App (ADR 0023), so the face is the whole signal.
 */
export function resolveChatTypingFace(
    event: Pick<AgentActivityEvent, 'category' | 'phase'>
): ChatTypingFace | null {
    if (event.phase === 'failed') {
        return chatTypingFailedFace;
    }
    return event.phase === 'started' ? (startedFaces[event.category] ?? null) : null;
}

/** An activity launches here only when its run is the one engaging this Chat. */
export function isEngagedActivity(
    engagements: readonly Pick<ChatEngagement, 'agentId' | 'runId'>[],
    event: Pick<AgentActivityEvent, 'agentId' | 'runId'>
) {
    return engagements.some(
        (engagement) => engagement.agentId === event.agentId && engagement.runId === event.runId
    );
}

export const chatTypingLaunchIntervalMs = 350;
export const chatTypingLaunchCap = 6;

/**
 * Admits at most one launch per interval and a bounded number in flight;
 * extras are dropped, not queued. Sent and failed faces skip the interval.
 */
export function admitChatTypingLaunch(
    state: { inFlight: number; lastLaunchAt: number | null },
    now: number,
    face: ChatTypingFace
) {
    if (state.inFlight >= chatTypingLaunchCap) {
        return false;
    }
    if (face === chatTypingSentFace || face === chatTypingFailedFace) {
        return true;
    }
    return state.lastLaunchAt === null || now - state.lastLaunchAt >= chatTypingLaunchIntervalMs;
}

export interface ChatTypingLaunchPath {
    durationMs: number;
    /** Horizontal drift in px; its sign is the launch direction. */
    dx: number;
    /** Height of the arc in px, above the dots. */
    rise: number;
    /** Final rotation in degrees, leaning with the drift. */
    rotate: number;
}

/** One randomized arc. Direction mostly alternates so bursts fan out. */
export function planChatTypingLaunch(
    previousDirection: 1 | -1,
    random: () => number = Math.random
): ChatTypingLaunchPath {
    const direction = random() < 0.72 ? -previousDirection : previousDirection;
    const between = (min: number, max: number) => min + random() * (max - min);
    return {
        dx: direction * between(8, 24),
        durationMs: between(900, 1100),
        rise: between(42, 70),
        rotate: direction * between(6, 16),
    };
}
