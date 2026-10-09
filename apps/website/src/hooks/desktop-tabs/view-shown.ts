import * as React from 'react';

/**
 * Whether a kept view is on screen, readable without re-rendering. A chat view
 * kept mounted (and effect-alive) while hidden (`KeptChatViews`) gates its
 * imperative work on this: window listeners, animation loops, and timers check
 * `isShown()` when they fire, and reveal-time work (composer focus, Thread pane
 * sync) runs from `useViewShownChange`. A component that renders differently
 * while hidden reads `useTabPresence().shown` instead, which re-renders it.
 */
export interface ViewShown {
    isShown: () => boolean;
    subscribe: (listener: () => void) => () => void;
}

/** Outside a kept view: always shown, never changes. */
const alwaysShown: ViewShown = {
    isShown: () => true,
    subscribe: () => () => undefined,
};

export const ViewShownContext = React.createContext<ViewShown>(alwaysShown);

export function useViewShown(): ViewShown {
    return React.use(ViewShownContext);
}

/** Calls `onChange` after each commit that shows or hides this view (never on mount). */
export function useViewShownChange(onChange: (shown: boolean) => void) {
    const viewShown = useViewShown();
    const handleChange = React.useEffectEvent(() => onChange(viewShown.isShown()));
    React.useEffect(() => viewShown.subscribe(handleChange), [viewShown]);
}

export interface ViewShownSource extends ViewShown {
    /** Tells subscribers, from a passive effect, when `shown` differs from what they last heard. */
    notify: (shown: boolean) => void;
    /** Records the state in a layout effect, so `isShown()` is current before passive effects. */
    set: (shown: boolean) => void;
}

export function createViewShownSource(initial: boolean): ViewShownSource {
    let shown = initial;
    let notified = initial;
    const listeners = new Set<() => void>();
    return {
        isShown: () => shown,
        notify(next) {
            if (notified === next) {
                return;
            }
            notified = next;
            for (const listener of listeners) {
                listener();
            }
        },
        set(next) {
            shown = next;
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}
