import * as React from 'react';

/**
 * The chat's highest visible sequence, held outside React state: the
 * transcript reports it as rows scroll in and out, and only its reader
 * (`ChatReadState`) re-renders, never the whole chat view.
 */
export interface VisibleChatSequence {
    get: () => number | undefined;
    set: (sequence: number | undefined) => void;
    subscribe: (listener: () => void) => () => void;
}

export function useVisibleChatSequenceSource(): VisibleChatSequence {
    const [source] = React.useState(createVisibleChatSequence);
    return source;
}

export function useVisibleChatSequence(source: VisibleChatSequence): number | undefined {
    return React.useSyncExternalStore(source.subscribe, source.get, source.get);
}

export function createVisibleChatSequence(): VisibleChatSequence {
    let sequence: number | undefined;
    const listeners = new Set<() => void>();
    return {
        get: () => sequence,
        set(next) {
            if (next === sequence) {
                return;
            }
            sequence = next;
            for (const listener of listeners) {
                listener();
            }
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
