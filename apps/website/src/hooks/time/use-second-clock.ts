import * as React from 'react';

/**
 * The current time, updated on each whole second by one shared timer. Every
 * caller re-renders in the same tick, so a row of live counters advances
 * together in one commit instead of one commit per counter at scattered
 * offsets. The timer runs only while something is subscribed.
 */
export function useSecondClock(): number {
    return React.useSyncExternalStore(subscribe, readNow, readNow);
}

let now = Date.now();
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function readNow() {
    return now;
}

function subscribe(listener: () => void) {
    if (listeners.size === 0) {
        now = Date.now();
        schedule();
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
    };
}

/** Wakes just after the next whole second, so displayed seconds never skip or stall. */
function schedule() {
    timer = setTimeout(
        () => {
            now = Date.now();
            schedule();
            for (const listener of listeners) {
                listener();
            }
        },
        1000 - (Date.now() % 1000) + 5
    );
}
