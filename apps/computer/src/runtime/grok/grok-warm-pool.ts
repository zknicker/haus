import { closeGrokLive, type GrokLive } from './grok-live.ts';

/**
 * Detached Grok sessions whose process stays warm between turns, keyed by Grok session id. The
 * next turn's open claims one when its launch facts are unchanged; otherwise the warm process
 * ends and the session reloads in a fresh one. Computer shutdown ends every warm process
 * through the sandbox process owner.
 */
const warm = new Map<string, GrokLive>();

export async function parkWarm(live: GrokLive): Promise<void> {
    const previous = warm.get(live.sessionId);
    warm.set(live.sessionId, live);
    void live.process.exited.then(() => {
        if (warm.get(live.sessionId) === live) {
            warm.delete(live.sessionId);
        }
    });
    if (previous && previous !== live) {
        await closeGrokLive(previous);
    }
}

/** The warm session for `sessionId` when it still runs with `fingerprint`'s launch facts. */
export async function claimWarm(
    sessionId: string,
    fingerprint: string
): Promise<GrokLive | undefined> {
    const live = warm.get(sessionId);
    if (!live) {
        return;
    }
    warm.delete(sessionId);
    if (live.fingerprint === fingerprint && !live.process.connection.closed) {
        return live;
    }
    await closeGrokLive(live);
}

/** Test seam: how many sessions are parked warm. */
export function warmSessionCount(): number {
    return warm.size;
}
