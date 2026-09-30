import * as React from 'react';

/**
 * App-local memory of which reactions arrived live, so only those stamp in.
 *
 * Durable chat data never learns about this. A realtime `message.reaction.updated`
 * names only the message, so the ledger marks that message live for a short
 * window and the next render that shows a reaction it had not seen before
 * treats it as an arrival. The viewer's own add is also held here as a pending
 * overlay until the Server's copy of the reaction lands, which is what makes
 * it appear (and stamp) before the round trip finishes. History and reloads
 * find no live mark and no baseline, so they always render at rest.
 */
export interface FreshReactionLedger {
    addPending: (messageId: string, emoji: string, nowMs: number) => void;
    dropPending: (messageId: string, emoji: string) => void;
    /** Marks a message whose reactions changed live. `eventMs` is the event's own timestamp. */
    noteLive: (messageId: string, eventMs: number, nowMs: number) => void;
    /**
     * Records the reaction keys a message renders now and returns the keys
     * that are new *and* arrived live. A message seen for the first time only
     * sets its baseline.
     */
    observe: (messageId: string, keys: readonly string[], nowMs: number) => string[];
    /** Pending own adds for one message; identity changes only when the set does. */
    pending: (messageId: string) => readonly string[];
    subscribe: (listener: () => void) => () => void;
}

/** A catch-up replay after a reconnect carries old events; those are history. */
export const liveEventMaxAgeMs = 30_000;
/** How long after a live event its refetched data may still count as an arrival. */
export const liveWindowMs = 8000;
/** A pending own add that never reconciles is dropped rather than shown forever. */
export const pendingTtlMs = 15_000;

export function reactionKey(emoji: string, actorId: string) {
    return `${emoji}\u0000${actorId}`;
}

export function createFreshReactionLedger(): FreshReactionLedger {
    const baselines = new Map<string, ReadonlySet<string>>();
    const liveUntil = new Map<string, number>();
    const pendingAdds = new Map<string, Map<string, number>>();
    const pendingSnapshots = new Map<string, readonly string[]>();
    const listeners = new Set<() => void>();
    const empty: readonly string[] = [];

    const emit = (messageId: string) => {
        const adds = pendingAdds.get(messageId);
        if (adds && adds.size > 0) {
            pendingSnapshots.set(messageId, [...adds.keys()]);
        } else {
            pendingAdds.delete(messageId);
            pendingSnapshots.delete(messageId);
        }
        for (const listener of listeners) {
            listener();
        }
    };

    return {
        addPending: (messageId, emoji, nowMs) => {
            const adds = pendingAdds.get(messageId) ?? new Map<string, number>();
            adds.set(emoji, nowMs + pendingTtlMs);
            pendingAdds.set(messageId, adds);
            emit(messageId);
        },
        dropPending: (messageId, emoji) => {
            if (pendingAdds.get(messageId)?.delete(emoji)) {
                emit(messageId);
            }
        },
        noteLive: (messageId, eventMs, nowMs) => {
            if (nowMs - eventMs <= liveEventMaxAgeMs) {
                liveUntil.set(messageId, nowMs + liveWindowMs);
            }
        },
        observe: (messageId, keys, nowMs) => {
            const baseline = baselines.get(messageId);
            baselines.set(messageId, new Set(keys));
            if (!baseline) {
                return [];
            }
            const live = (liveUntil.get(messageId) ?? 0) > nowMs;
            const adds = pendingAdds.get(messageId);
            return keys.filter((key) => {
                const emoji = key.slice(0, key.indexOf('\u0000'));
                const pendingUntil = adds?.get(emoji) ?? 0;
                return !baseline.has(key) && (live || pendingUntil > nowMs);
            });
        },
        pending: (messageId) => pendingSnapshots.get(messageId) ?? empty,
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}

export const freshReactions = createFreshReactionLedger();

/** The viewer's own reactions that the Server has not confirmed yet. */
export function usePendingOwnReactions(messageId: string) {
    return React.useSyncExternalStore(
        freshReactions.subscribe,
        () => freshReactions.pending(messageId),
        () => freshReactions.pending(messageId)
    );
}
