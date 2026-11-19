import * as React from 'react';

let requests = 0;
const listeners = new Set<() => void>();

export function requestHomePromptFocus() {
    requests += 1;
    for (const listener of listeners) {
        listener();
    }
}

export function useHomePromptFocusRequests(focus: () => void) {
    const count = React.useSyncExternalStore(subscribe, readRequests, readRequests);
    const seen = React.useRef(count);
    React.useEffect(() => {
        if (count !== seen.current) {
            seen.current = count;
            focus();
        }
    }, [count, focus]);
}

function readRequests() {
    return requests;
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
