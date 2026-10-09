import EventEmitter, { on } from 'node:events';
import type { AgentExecutionJournalChange } from '@haus/api';

interface ServerJournalChange extends AgentExecutionJournalChange {
    serverId: string;
}

const eventName = 'agent.execution-journal.changed';
const emitter = new EventEmitter();

emitter.setMaxListeners(0);

/**
 * Volatile: a Computer's notice that a running turn's journal gained evidence.
 * Nothing is stored; an open turn view re-reads the journal on demand.
 */
export function publishExecutionJournalChange(change: ServerJournalChange) {
    emitter.emit(eventName, change);
}

export async function* subscribeToExecutionJournalChanges(signal?: AbortSignal) {
    const iterator = signal ? on(emitter, eventName, { signal }) : on(emitter, eventName);

    for await (const [change] of iterator) {
        yield change as ServerJournalChange;
    }
}
