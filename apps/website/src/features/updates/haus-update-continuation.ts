import { z } from 'zod';

/**
 * The Computer updates one Update press still owes after it restarts the App
 * for its own update. App-local intent: the relaunched App resumes it once,
 * and an expired intent never starts work later.
 */
export interface HausUpdateContinuation {
    computerIds: readonly string[];
    createdAt: number;
    serverId: string;
}

export const hausUpdateContinuationStorageKey = 'haus.update-continuation';
export const hausUpdateContinuationTtlMs = 30 * 60_000;

const continuationSchema = z.object({
    computerIds: z.array(z.string().min(1)).min(1),
    createdAt: z.number(),
    serverId: z.string().min(1),
});

type ContinuationStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function rememberHausUpdateContinuation(
    input: { computerIds: readonly string[]; serverId: string },
    storage: ContinuationStorage = window.localStorage,
    now = Date.now()
) {
    const continuation: HausUpdateContinuation = { ...input, createdAt: now };
    storage.setItem(hausUpdateContinuationStorageKey, JSON.stringify(continuation));
}

export function forgetHausUpdateContinuation(storage: ContinuationStorage = window.localStorage) {
    storage.removeItem(hausUpdateContinuationStorageKey);
}

/** The live continuation for this Server, without consuming it. Safe to call while rendering. */
export function readHausUpdateContinuation(
    serverId: string,
    storage: Pick<Storage, 'getItem'> = window.localStorage,
    now = Date.now()
): HausUpdateContinuation | null {
    const continuation = parseContinuation(storage.getItem(hausUpdateContinuationStorageKey));
    return continuation?.serverId === serverId && isLive(continuation, now) ? continuation : null;
}

/**
 * Consumes this Server's continuation, discarding an expired one. Reading and
 * removing in one synchronous call makes the resume exactly-once across effect
 * replays and App windows.
 */
export function takeHausUpdateContinuation(
    serverId: string,
    storage: ContinuationStorage = window.localStorage,
    now = Date.now()
): HausUpdateContinuation | null {
    const stored = parseContinuation(storage.getItem(hausUpdateContinuationStorageKey));
    if (stored?.serverId !== serverId) {
        return null;
    }
    forgetHausUpdateContinuation(storage);
    return isLive(stored, now) ? stored : null;
}

function isLive(continuation: HausUpdateContinuation, now: number) {
    const age = now - continuation.createdAt;
    return age >= 0 && age <= hausUpdateContinuationTtlMs;
}

function parseContinuation(raw: string | null): HausUpdateContinuation | null {
    if (!raw) {
        return null;
    }
    try {
        const parsed = continuationSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}
