import EventEmitter, { on } from 'node:events';
import { type AgentThoughtEvent, agentThoughtEventSchema } from '@haus/api';

const eventName = 'agent.thought.announced';
const emitter = new EventEmitter();

emitter.setMaxListeners(0);

/** Announces a volatile thought. Nothing persists it, so a missed one is simply gone. */
export function announceAgentThought(event: AgentThoughtEvent) {
    const parsed = agentThoughtEventSchema.parse(event);
    emitter.emit(eventName, parsed);
    return parsed;
}

export async function* subscribeToAgentThoughts(signal?: AbortSignal) {
    const iterator = signal ? on(emitter, eventName, { signal }) : on(emitter, eventName);

    for await (const [event] of iterator) {
        yield agentThoughtEventSchema.parse(event);
    }
}
