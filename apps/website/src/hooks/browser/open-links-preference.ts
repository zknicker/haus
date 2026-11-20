import * as React from 'react';

export type OpenLinksIn = 'browser' | 'haus';

export const openLinksInOptions: ReadonlyArray<{ id: OpenLinksIn; label: string }> = [
    { id: 'haus', label: 'Haus' },
    { id: 'browser', label: 'Default browser' },
];

const storageKey = 'haus.links.openIn';

let openLinksIn = readOpenLinksIn();
const listeners = new Set<() => void>();

export function useOpenLinksIn() {
    return React.useSyncExternalStore(subscribe, getOpenLinksIn, getOpenLinksIn);
}

export function getOpenLinksIn() {
    return openLinksIn;
}

export function setOpenLinksIn(next: OpenLinksIn) {
    openLinksIn = next;
    if (typeof window !== 'undefined') {
        window.localStorage.setItem(storageKey, next);
    }
    for (const listener of listeners) {
        listener();
    }
}

export function parseOpenLinksIn(value: unknown) {
    return openLinksInOptions.find((option) => option.id === value)?.id ?? null;
}

export function readOpenLinksIn(
    storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined'
        ? undefined
        : window.localStorage
) {
    return parseOpenLinksIn(storage?.getItem(storageKey)) ?? 'haus';
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
