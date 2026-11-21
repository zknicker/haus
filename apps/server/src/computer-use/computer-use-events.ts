import EventEmitter, { on } from 'node:events';
import { computerUseRequestUpdatedEventSchema } from '@haus/api';

const eventName = 'computerUse.requestUpdated';
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function announceComputerUseRequest(input: {
    chatId: string;
    requestId: string;
    serverId: string;
}) {
    try {
        emitter.emit(
            eventName,
            computerUseRequestUpdatedEventSchema.parse({
                chatId: input.chatId,
                emittedAt: new Date().toISOString(),
                requestId: input.requestId,
                serverId: input.serverId,
                type: 'computerUse.requestUpdated',
            })
        );
    } catch (error) {
        console.error('[haus] computer use announce failed', {
            errorClass: error instanceof Error ? error.name : typeof error,
        });
    }
}

export async function* subscribeToComputerUseRequests(signal?: AbortSignal) {
    const iterator = signal ? on(emitter, eventName, { signal }) : on(emitter, eventName);
    for await (const [event] of iterator) {
        yield computerUseRequestUpdatedEventSchema.parse(event);
    }
}
