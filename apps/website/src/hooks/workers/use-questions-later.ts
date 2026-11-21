import * as React from 'react';

export const questionsLaterStorageKey = 'haus.worker-questions.later';

const keptTurns = 50;

type LaterStorage = Pick<Storage, 'getItem' | 'setItem'>;

let laterTurns: readonly string[] = readLaterTurns(safeLocalStorage()) ?? [];
const listeners = new Set<() => void>();

export function useQuestionsLater(turnId: null | string) {
    const turns = React.useSyncExternalStore(subscribe, getLaterTurns, getLaterTurns);
    return turnId !== null && turns.includes(turnId);
}

export function getLaterTurns() {
    return laterTurns;
}

export function setQuestionsLater(
    turnId: string,
    later: boolean,
    storage: LaterStorage | null = safeLocalStorage()
) {
    const others = laterTurns.filter((id) => id !== turnId);
    const next = later ? [...others, turnId].slice(-keptTurns) : others;
    if (next.length === laterTurns.length && next.every((id, index) => id === laterTurns[index])) {
        return;
    }
    laterTurns = next;
    writeLaterTurns(storage, next);
    for (const listener of listeners) {
        listener();
    }
}

export function reloadQuestionsLater(storage: LaterStorage | null = safeLocalStorage()) {
    laterTurns = readLaterTurns(storage) ?? laterTurns;
    for (const listener of listeners) {
        listener();
    }
}

export function readLaterTurns(storage: LaterStorage | null) {
    if (!storage) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(storage.getItem(questionsLaterStorageKey) ?? '[]');
        return Array.isArray(parsed)
            ? parsed.filter((id): id is string => typeof id === 'string')
            : [];
    } catch {
        return [];
    }
}

function writeLaterTurns(storage: LaterStorage | null, turns: readonly string[]) {
    try {
        storage?.setItem(questionsLaterStorageKey, JSON.stringify(turns));
    } catch {
        // WARNING: blocked storage keeps Later for this window only.
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1 && typeof window !== 'undefined') {
        laterTurns = readLaterTurns(safeLocalStorage()) ?? laterTurns;
        window.addEventListener('storage', followOtherWindows);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') {
            window.removeEventListener('storage', followOtherWindows);
        }
    };
}

function followOtherWindows(event: StorageEvent) {
    if (event.key === questionsLaterStorageKey || event.key === null) {
        reloadQuestionsLater();
    }
}

function safeLocalStorage() {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}
