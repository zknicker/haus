import EventEmitter, { on } from 'node:events';
import type { AgentExecutionJournalChange } from '@haus/api';

interface ServerJournalChange extends AgentExecutionJournalChange {
    serverId: string;
}

const eventName = 'agent.execution-journal.changed';
const emitter = new EventEmitter();
/** At most one notice per run in this window; the last change always gets one. */
export const journalChangeIntervalMs = 1000;
const lastNoticeAt = new Map<string, number>();
const waiting = new Set<string>();

emitter.setMaxListeners(0);

/**
 * Volatile: a run's stored journal gained records. Nothing else is carried; an
 * open turn view re-reads the journal. A burst of uploads within a second
 * collapses into one trailing notice.
 */
export function publishExecutionJournalChange(
    change: ServerJournalChange,
    clock: { now(): number; schedule(run: () => void, ms: number): void } = systemClock
) {
    const key = `${change.serverId}/${change.agentId}/${change.runId}`;
    if (waiting.has(key)) {
        return;
    }
    const wait = (lastNoticeAt.get(key) ?? Number.NEGATIVE_INFINITY) + journalChangeIntervalMs;
    const emit = () => {
        waiting.delete(key);
        lastNoticeAt.set(key, clock.now());
        emitter.emit(eventName, change);
        clock.schedule(() => forget(key, clock), journalChangeIntervalMs);
    };
    if (wait <= clock.now()) {
        emit();
        return;
    }
    waiting.add(key);
    clock.schedule(emit, wait - clock.now());
}

export async function* subscribeToExecutionJournalChanges(signal?: AbortSignal) {
    const iterator = signal ? on(emitter, eventName, { signal }) : on(emitter, eventName);

    for await (const [change] of iterator) {
        yield change as ServerJournalChange;
    }
}

/** Drops a quiet run's throttle state so the map tracks only recent runs. */
function forget(key: string, clock: { now(): number }) {
    const last = lastNoticeAt.get(key);
    if (!waiting.has(key) && last !== undefined && clock.now() - last >= journalChangeIntervalMs) {
        lastNoticeAt.delete(key);
    }
}

const systemClock = {
    now: () => Date.now(),
    schedule: (run: () => void, ms: number) => {
        setTimeout(run, ms).unref?.();
    },
};
