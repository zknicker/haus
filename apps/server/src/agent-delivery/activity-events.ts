import EventEmitter, { on } from 'node:events';
import { type AgentActivityEvent, agentActivityEventSchema } from '@haus/api';

const eventName = 'agent.activity.committed';
const emitter = new EventEmitter();

emitter.setMaxListeners(0);

/** Broadcast only after the transaction that wrote the activity row commits. */
export function publishCommittedAgentActivity(event: AgentActivityEvent) {
    const parsed = agentActivityEventSchema.parse(event);
    emitter.emit(eventName, parsed);
    return parsed;
}

export async function* subscribeToCommittedAgentActivity(signal?: AbortSignal) {
    const iterator = signal ? on(emitter, eventName, { signal }) : on(emitter, eventName);

    for await (const [event] of iterator) {
        yield agentActivityEventSchema.parse(event);
    }
}
