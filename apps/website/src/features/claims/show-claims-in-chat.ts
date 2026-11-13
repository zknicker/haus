import * as React from 'react';
import type { ClaimOrigin } from './claim-presentation.ts';

/**
 * Per-device preference for showing Agent claims in the Chat transcript.
 * Thread replies do not override it; human-created claims remain visible.
 * An external store keeps the preference shared without a transcript provider.
 */
const storageKey = 'haus.chat.showClaims';

let showClaims = readShowClaimsInChat();
const listeners = new Set<() => void>();

export function useShowClaimsInChat(): boolean {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setShowClaimsInChat(next: boolean) {
    showClaims = next;

    if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, next ? 'on' : 'off');
    }

    for (const listener of listeners) {
        listener();
    }
}

/**
 * The stored preference, defaulting off. Nothing stored and anything
 * unrecognized both mean off: the setting only ever turns on by being asked
 * for.
 */
export function readShowClaimsInChat(
    storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined'
        ? undefined
        : window.localStorage
): boolean {
    return storage?.getItem(storageKey) === 'on';
}

/**
 * The rule Chat renders a message's claim by. A human composed or converted a
 * claim on purpose, so Chat always shows it; an Agent's own claim is
 * bookkeeping and appears only when the reader asked to see it.
 */
export function claimVisibleInChat(origin: ClaimOrigin, showClaimsInChat: boolean): boolean {
    return showClaimsInChat || origin !== 'claimed';
}

export const showClaimsInChatStorageKey = storageKey;

function getSnapshot() {
    return showClaims;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
