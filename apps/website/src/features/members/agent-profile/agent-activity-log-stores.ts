import * as React from 'react';
import type { TraceBarKind } from '../../turn-trace/turn-trace-grid.tsx';
import type { TurnTraceStatus } from '../../turn-trace/turn-trace-tool-model.ts';

/**
 * Shared, high-churn log state lives in small
 * external stores so a hover or an admission re-renders only the rows that
 * read it, never the whole log and its traces.
 */

/** At most this many journal reads in flight: a burst wedges the dev Server pool. */
const maxInFlight = 3;

/**
 * Admits open turns' journal reads in request order, a few at a time. A turn
 * stays admitted once its read settles, so collapsing and reopening it keeps
 * its trace without asking again.
 */
export class JournalQueue {
    private readonly admitted = new Set<string>();
    private readonly inFlight = new Set<string>();
    private readonly listeners = new Set<() => void>();
    private readonly waiting: string[] = [];

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    isAdmitted(runId: string): boolean {
        return this.admitted.has(runId);
    }

    request(runId: string) {
        if (this.admitted.has(runId) || this.waiting.includes(runId)) {
            return;
        }
        this.waiting.push(runId);
        this.pump();
    }

    settle(runId: string) {
        if (this.inFlight.delete(runId)) {
            this.pump();
        }
    }

    private pump() {
        let changed = false;
        while (this.inFlight.size < maxInFlight && this.waiting.length > 0) {
            const next = this.waiting.shift() as string;
            this.admitted.add(next);
            this.inFlight.add(next);
            changed = true;
        }
        if (changed) {
            for (const listener of this.listeners) {
                listener();
            }
        }
    }
}

/** A step's place inside its turn, as fractions of the turn's axis. */
export interface LinkedSpan {
    readonly start: number;
    readonly width: number;
}

export interface LinkedHover {
    readonly runId: string;
    readonly source: 'overview' | 'row';
    readonly span: LinkedSpan | null;
}

/** Which turn the pointer is on, in the overview or the log, so the other follows. */
export class LinkedHoverStore {
    private current: LinkedHover | null = null;
    private readonly listeners = new Set<() => void>();

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    get = () => this.current;

    set(next: LinkedHover | null) {
        const same =
            next?.runId === this.current?.runId &&
            next?.source === this.current?.source &&
            next?.span?.start === this.current?.span?.start &&
            next?.span?.width === this.current?.span?.width;
        if (same) {
            return;
        }
        this.current = next;
        for (const listener of this.listeners) {
            listener();
        }
    }
}

/** A top-level step's place on its turn's axis, for the overview's density marks. */
export interface StepMark {
    readonly kind: TraceBarKind;
    readonly start: number;
    readonly status: TurnTraceStatus;
    readonly width: number;
}

/**
 * Each read turn's step marks, published by its log group so the overview
 * draws a turn's inner rhythm without reading any journal itself.
 */
export class StepMarksStore {
    private readonly marks = new Map<string, readonly StepMark[]>();
    private readonly keys = new Map<string, string>();
    private readonly listeners = new Set<() => void>();

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    get = (runId: string) => this.marks.get(runId) ?? null;

    set(runId: string, marks: readonly StepMark[]) {
        const key = JSON.stringify(marks);
        if (this.keys.get(runId) === key) {
            return;
        }
        this.keys.set(runId, key);
        this.marks.set(runId, marks);
        for (const listener of this.listeners) {
            listener();
        }
    }
}

export interface ActivityLogStores {
    readonly hover: LinkedHoverStore;
    readonly marks: StepMarksStore;
    readonly queue: JournalQueue;
    /** Opens a turn and brings it into view: the overview's click. */
    readonly reveal: (runId: string) => void;
}

export const ActivityLogStoresContext = React.createContext<ActivityLogStores | null>(null);

export function useActivityLogStores(): ActivityLogStores {
    const stores = React.use(ActivityLogStoresContext);
    if (!stores) {
        throw new Error('Activity log stores are missing.');
    }
    return stores;
}

export function useLinkedHover(): LinkedHover | null {
    const { hover } = useActivityLogStores();
    return React.useSyncExternalStore(hover.subscribe, hover.get);
}

/** Whether the overview is pointing at this turn: one boolean per row group. */
export function useIsLinkedFromOverview(runId: string): boolean {
    const { hover } = useActivityLogStores();
    return React.useSyncExternalStore(hover.subscribe, () => {
        const current = hover.get();
        return current?.source === 'overview' && current.runId === runId;
    });
}

export function useStepMarks(runId: string): readonly StepMark[] | null {
    const { marks } = useActivityLogStores();
    return React.useSyncExternalStore(marks.subscribe, () => marks.get(runId));
}

/** Asks for this turn's journal while it is open; true once its read is admitted. */
export function useJournalAdmission(runId: string, isOpen: boolean): boolean {
    const { queue } = useActivityLogStores();
    React.useEffect(() => {
        if (isOpen) {
            queue.request(runId);
        }
    }, [isOpen, queue, runId]);
    return React.useSyncExternalStore(queue.subscribe, () => queue.isAdmitted(runId));
}
