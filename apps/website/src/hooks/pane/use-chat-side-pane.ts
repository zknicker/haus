import * as React from 'react';

export type ChatSidePaneKind = 'artifact' | 'files' | 'profile' | 'thread';

const activePanes = new Map<string, ChatSidePaneKind>();
const listeners = new Set<() => void>();

export function useChatSidePane(chatId: string): ChatSidePaneKind {
    return React.useSyncExternalStore(
        subscribe,
        () => getChatSidePane(chatId),
        () => 'artifact'
    );
}

export function getChatSidePane(chatId: string): ChatSidePaneKind {
    return activePanes.get(chatId) ?? 'artifact';
}

export function setChatSidePane(chatId: string, pane: ChatSidePaneKind) {
    if (getChatSidePane(chatId) === pane) {
        return;
    }

    activePanes.set(chatId, pane);
    emitChange();
}

export function resetChatSidePanesForTest() {
    activePanes.clear();
    emitChange();
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
