import * as React from 'react';
import type { ChatMessageJumpTarget } from './use-chat-message-navigation.ts';

const pending = new Map<string, ChatMessageJumpTarget>();
const listeners = new Set<() => void>();

/**
 * Asks a Chat's transcript to scroll to and flash one message the next time
 * it shows: "View in chat" from a surface outside the Chat (a Thread tab)
 * requests the reveal, then navigates. A later request replaces an unserved one.
 */
export function requestMessageReveal(chatId: string, target: ChatMessageJumpTarget) {
    pending.set(chatId, target);
    emitChange();
}

/** Serves the Chat's pending reveal once its transcript has loaded, through `reveal`. */
export function usePendingMessageReveal({
    chatId,
    ready,
    reveal,
}: {
    chatId: string;
    ready: boolean;
    reveal: (target: ChatMessageJumpTarget) => void;
}) {
    const target = React.useSyncExternalStore(
        subscribe,
        () => pending.get(chatId) ?? null,
        () => null
    );
    React.useEffect(() => {
        if (!(ready && target)) {
            return;
        }
        // After the transcript's own first-paint scroll, which would otherwise win.
        // Taken inside the frame: taking it re-renders, and that cleanup would cancel the frame.
        const frame = window.requestAnimationFrame(() => {
            const taken = takeMessageReveal(chatId);
            if (taken) {
                reveal(taken);
            }
        });
        return () => window.cancelAnimationFrame(frame);
    }, [chatId, ready, reveal, target]);
}

/** Removes and returns the Chat's pending reveal; exported for tests. */
export function takeMessageReveal(chatId: string): ChatMessageJumpTarget | null {
    const target = pending.get(chatId) ?? null;
    if (target) {
        pending.delete(chatId);
        emitChange();
    }
    return target;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emitChange() {
    for (const listener of listeners) {
        listener();
    }
}
