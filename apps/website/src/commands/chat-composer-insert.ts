import * as React from 'react';

// Selection→quote and any future "add to chat" affordance insert text into
// the active chat composer through this command, mirroring
// chat-composer-focus.ts. Presence registration lets quote affordances hide
// on surfaces without a composer (e.g. the standalone Wiki page).

const chatComposerInsertEventName = 'haus:chat-composer-insert-request';

let composerTargetCount = 0;
const presenceListeners = new Set<() => void>();

export function requestChatComposerInsert(text: string) {
    window.dispatchEvent(new CustomEvent(chatComposerInsertEventName, { detail: { text } }));
}

export function useChatComposerInsertRequest(insert: (text: string) => void) {
    React.useEffect(() => {
        const listener = (event: Event) => {
            const detail = (event as CustomEvent<{ text?: unknown }>).detail;
            if (typeof detail?.text === 'string' && detail.text.length > 0) {
                insert(detail.text);
            }
        };

        window.addEventListener(chatComposerInsertEventName, listener);
        const unregister = registerComposerTarget();
        return () => {
            window.removeEventListener(chatComposerInsertEventName, listener);
            unregister();
        };
    }, [insert]);
}

/** Whether any chat composer is currently accepting inserts. */
export function useChatComposerInsertTarget() {
    return React.useSyncExternalStore(subscribeToPresence, getComposerTargetPresent, () => false);
}

export function appendComposerInsert(current: string, text: string) {
    const trimmed = current.trimEnd();
    return trimmed.length > 0 ? `${trimmed}\n\n${text}` : text;
}

function registerComposerTarget() {
    composerTargetCount += 1;
    notifyPresence();
    return () => {
        composerTargetCount -= 1;
        notifyPresence();
    };
}

function subscribeToPresence(listener: () => void) {
    presenceListeners.add(listener);
    return () => presenceListeners.delete(listener);
}

function getComposerTargetPresent() {
    return composerTargetCount > 0;
}

function notifyPresence() {
    for (const listener of presenceListeners) {
        listener();
    }
}
