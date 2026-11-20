import * as React from 'react';

let pending = false;
const listeners = new Set<() => void>();

export function requestHomePromptFocus() {
    setPending(true);
}

export function useHomePromptFocusRequests(focus: () => void) {
    const isPending = React.useSyncExternalStore(subscribe, readPending, readPending);
    React.useEffect(() => {
        if (!isPending) {
            return;
        }
        setPending(false);
        requestAnimationFrame(focus);
    }, [isPending, focus]);
}

function setPending(next: boolean) {
    pending = next;
    for (const listener of listeners) {
        listener();
    }
}

function readPending() {
    return pending;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
