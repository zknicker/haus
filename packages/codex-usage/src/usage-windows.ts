import { headerNumber, numberField } from './field-values.ts';
import type { CodexUsageWindow, CodexUsageWindowId } from './types.ts';

const CODEX_USAGE_WINDOW_LABELS: Record<CodexUsageWindowId, string> = {
    'current-session': 'Current session',
    'current-week': 'Current week',
};
const SESSION_WINDOW_MAX_SECONDS = 21_600;
const WEEK_WINDOW_MIN_SECONDS = 86_400;

export function buildUsageWindows(options: {
    headers: Headers | undefined;
    now: Date;
    primaryWindow: Record<string, unknown> | undefined;
    secondaryWindow: Record<string, unknown> | undefined;
}): CodexUsageWindow[] {
    const slots = collectWindowSlots(options);
    const ids = assignWindowIds(slots);

    return slots.map((slot, index) => toUsageWindow(slot, ids[index], options.now));
}

function collectWindowSlots(options: {
    headers: Headers | undefined;
    primaryWindow: Record<string, unknown> | undefined;
    secondaryWindow: Record<string, unknown> | undefined;
}): WindowSlot[] {
    const sources = [
        {
            fallbackId: 'current-session',
            headerKey: 'x-codex-primary-used-percent',
            rawWindow: options.primaryWindow,
        },
        {
            fallbackId: 'current-week',
            headerKey: 'x-codex-secondary-used-percent',
            rawWindow: options.secondaryWindow,
        },
    ] as const;

    const slots: WindowSlot[] = [];
    for (const source of sources) {
        const usedPercent =
            headerNumber(options.headers, source.headerKey) ??
            numberField(source.rawWindow, 'used_percent');

        if (usedPercent !== null) {
            slots.push({
                fallbackId: source.fallbackId,
                rawWindow: source.rawWindow,
                usedPercent,
            });
        }
    }

    return slots;
}

// The two slots are classified together: the window id is a two-member union,
// so one slot's evidence constrains the other's, and a collision must resolve
// rather than drop a window the App still has to render.
function assignWindowIds(slots: WindowSlot[]): CodexUsageWindowId[] {
    const candidates = slots.map((slot) => classifyWindowSlot(slot.rawWindow));
    const [first, second] = candidates;

    if (!(first && second)) {
        return slots.map((slot, index) => candidates[index].id ?? slot.fallbackId);
    }

    if (first.id !== null && second.id !== null && first.id !== second.id) {
        return [first.id, second.id];
    }

    // A promotion from a long countdown is evidence just like a reported
    // duration. Weighing only the reported duration here dropped the promotion,
    // and the promoted slot fell back to its position the moment a second slot
    // existed.
    if (first.id !== null && second.id === null) {
        const remaining = otherWindowId(first.id);
        if (canTakeWindowId(second, remaining)) {
            return [first.id, remaining];
        }
    }

    if (second.id !== null && first.id === null) {
        const remaining = otherWindowId(second.id);
        if (canTakeWindowId(first, remaining)) {
            return [remaining, second.id];
        }
    }

    return slots.map((slot) => slot.fallbackId);
}

function classifyWindowSlot(rawWindow: Record<string, unknown> | undefined): WindowCandidate {
    const authoritativeId = classifyWindowDuration(numberField(rawWindow, 'limit_window_seconds'));
    // reset_after_seconds is time remaining, not window length. A long countdown
    // rules out a 5h window; a short one proves nothing, so it may only promote.
    const resetAfterSeconds = numberField(rawWindow, 'reset_after_seconds');
    const rejectsSession =
        resetAfterSeconds !== null && resetAfterSeconds > SESSION_WINDOW_MAX_SECONDS;

    return {
        id: authoritativeId ?? (rejectsSession ? 'current-week' : null),
        rejectsSession,
    };
}

function classifyWindowDuration(seconds: number | null): CodexUsageWindowId | null {
    if (seconds === null) {
        return null;
    }

    if (seconds <= SESSION_WINDOW_MAX_SECONDS) {
        return 'current-session';
    }

    return seconds >= WEEK_WINDOW_MIN_SECONDS ? 'current-week' : null;
}

function canTakeWindowId(candidate: WindowCandidate, id: CodexUsageWindowId): boolean {
    return !(id === 'current-session' && candidate.rejectsSession);
}

function otherWindowId(id: CodexUsageWindowId): CodexUsageWindowId {
    return id === 'current-session' ? 'current-week' : 'current-session';
}

function toUsageWindow(slot: WindowSlot, id: CodexUsageWindowId, now: Date): CodexUsageWindow {
    const resetAfterSeconds = numberField(slot.rawWindow, 'reset_after_seconds');
    const resetAt = numberField(slot.rawWindow, 'reset_at');

    return {
        id,
        label: CODEX_USAGE_WINDOW_LABELS[id],
        remainingPercent: clampPercent(100 - slot.usedPercent),
        resetAfterSeconds,
        resetsAt: resolveResetsAt(resetAt, resetAfterSeconds, now),
        usedPercent: clampPercent(slot.usedPercent),
    };
}

function resolveResetsAt(
    resetAt: number | null,
    resetAfterSeconds: number | null,
    now: Date
): string | null {
    if (resetAt !== null) {
        return new Date(resetAt * 1000).toISOString();
    }

    if (resetAfterSeconds !== null) {
        return new Date(now.getTime() + resetAfterSeconds * 1000).toISOString();
    }

    return null;
}

function clampPercent(value: number): number {
    return Math.max(0, Math.min(100, value));
}

interface WindowSlot {
    fallbackId: CodexUsageWindowId;
    rawWindow: Record<string, unknown> | undefined;
    usedPercent: number;
}

interface WindowCandidate {
    id: CodexUsageWindowId | null;
    rejectsSession: boolean;
}
