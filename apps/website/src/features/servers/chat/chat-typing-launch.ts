import type { AgentActivityCategory, AgentActivityEvent, ChatEngagement } from '@haus/api';

/** A face that launches from the typing dots when an engaged Agent starts a kind of work. */
export type ChatTypingFace = '🤔' | '🧐' | '🤓' | '🫣' | '😤' | '🫡' | '🙂‍↕️' | '😵‍💫' | '😊' | '👀';

export const chatTypingThinkingFace = '🤔';
export const chatTypingFailedFace = '😵‍💫';
export const chatTypingSentFace = '😊';
/** An engagement that settled without a reply here: read it, nothing to add. */
export const chatTypingReadFace = '👀';

const startedFaces: Partial<Record<AgentActivityCategory, ChatTypingFace>> = {
    browsing: '🫣',
    editing_files: '😤',
    reading_files: '🧐',
    running_command: '🫡',
    searching_web: '🤓',
    thinking: chatTypingThinkingFace,
    using_tool: '🙂‍↕️',
};

/**
 * The face for one committed activity event, or null. Only a started kind of
 * work launches; any failure launches the dizzy face. `checking_messages` and
 * `sending_message` are the Agent's own Haus bookkeeping and launch nothing. Reasoning text never
 * reaches the App (ADR 0023); only condensed thought phrases
 * do, as a separate bubble (ADR 0036).
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

/**
 * Which engagements in the open Chat have had their 🤔. An Agent's run
 * often reports `thinking` before the Server has registered its engagement,
 * which drops that face, so the 🤔 launches when the engagement appears in the
 * strip instead, once per engagement: a `thinking` activity for one that
 * already launched stays quiet, and an engagement that ends and later starts
 * again, by a new run or the same one, launches its own.
 */
export interface ChatTypingThinkingLedger {
    /** The engagements that have launched, keyed by Chat, Agent, and run. */
    launched: Set<string>;
}

/**
 * Brings the ledger up to date with this Chat's engagements: forgets those
 * that ended, and returns how many 🤔 to launch for those that just appeared.
 */
export function syncChatTypingThinking(
    ledger: ChatTypingThinkingLedger,
    chatId: string,
    engagements: readonly Pick<ChatEngagement, 'agentId' | 'runId'>[]
): number {
    const current = new Set(engagements.map((engagement) => thinkingKey(chatId, engagement)));
    for (const key of ledger.launched) {
        if (key.startsWith(`${chatId}:`) && !current.has(key)) {
            ledger.launched.delete(key);
        }
    }
    let appeared = 0;
    for (const key of current) {
        if (!ledger.launched.has(key)) {
            ledger.launched.add(key);
            appeared += 1;
        }
    }
    return appeared;
}

/** Whether a `thinking` activity may launch 🤔: only once per engagement. */
export function admitChatTypingThinking(
    ledger: ChatTypingThinkingLedger,
    chatId: string,
    engagement: Pick<ChatEngagement, 'agentId' | 'runId'>
): boolean {
    const key = thinkingKey(chatId, engagement);
    if (ledger.launched.has(key)) {
        return false;
    }
    ledger.launched.add(key);
    return true;
}

function thinkingKey(chatId: string, engagement: Pick<ChatEngagement, 'agentId' | 'runId'>) {
    return `${chatId}:${engagement.agentId}:${engagement.runId}`;
}

export const chatTypingLaunchIntervalMs = 350;
/** No two faces start closer than this, priority faces included. */
export const chatTypingLaunchMinGapMs = 200;
export const chatTypingLaunchCap = 6;

export interface ChatTypingLaunchGate {
    inFlight: number;
    lastFace: ChatTypingFace | null;
    /** When the latest admitted face starts, which may be a scheduled moment. */
    lastLaunchAt: number | null;
}

/**
 * The delay before a face may start, or null to drop it. Work faces launch at
 * most once per interval and extras are dropped. Reply, read, and failure
 * faces skip the interval but wait out the minimum gap, so they always show
 * without landing on top of another face; the same face twice inside the
 * interval is dropped either way.
 */
export function admitChatTypingLaunch(
    state: ChatTypingLaunchGate,
    now: number,
    face: ChatTypingFace
): number | null {
    if (state.inFlight >= chatTypingLaunchCap) {
        return null;
    }
    const since = state.lastLaunchAt === null ? Number.POSITIVE_INFINITY : now - state.lastLaunchAt;
    if (face === state.lastFace && since < chatTypingLaunchIntervalMs) {
        return null;
    }
    if (priorityFaces.has(face)) {
        return Math.max(0, chatTypingLaunchMinGapMs - since);
    }
    return since >= chatTypingLaunchIntervalMs ? 0 : null;
}

const priorityFaces = new Set<ChatTypingFace>([
    chatTypingSentFace,
    chatTypingFailedFace,
    chatTypingReadFace,
]);

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
