import * as React from 'react';
import type { TaskOrigin } from './task-presentation.ts';

/**
 * Per-device preference for showing Agent claims before their Thread has replies.
 * Populated Threads always state their task; human-created tasks remain visible.
 * An external store keeps the preference shared without a transcript provider.
 */
const storageKey = 'haus.chat.showTasks';

let showTasks = readShowTasksInChat();
const listeners = new Set<() => void>();

export function useShowTasksInChat(): boolean {
    return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setShowTasksInChat(next: boolean) {
    showTasks = next;

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
export function readShowTasksInChat(
    storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined'
        ? undefined
        : window.localStorage
): boolean {
    return storage?.getItem(storageKey) === 'on';
}

/**
 * The rule Chat renders a message's task by. A human composed or converted a
 * task on purpose, so Chat always shows it; an Agent's own claim is
 * bookkeeping and appears only when the reader asked to see it.
 */
export function taskVisibleInChat(origin: TaskOrigin, showTasksInChat: boolean): boolean {
    return showTasksInChat || origin !== 'claimed';
}

export const showTasksInChatStorageKey = storageKey;

function getSnapshot() {
    return showTasks;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
