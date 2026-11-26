import type { InvokeResult, ProcessExitFrame } from '@haus/api';
import { handlerInput } from './handler-host.test-support.ts';

export function frameSink(agentsRoot: string) {
    const frames: unknown[] = [];
    const waiters: { resolve: (frame: unknown) => void; type: string }[] = [];
    const input = handlerInput(agentsRoot, frames);
    return {
        exits: () => frames.filter((frame): frame is ProcessExitFrame => typeOf(frame) === 'process-exit'),
        frames,
        input: {
            ...input,
            send: (frame: unknown) => {
                frames.push(frame);
                for (const waiter of waiters.splice(0)) {
                    if (typeOf(frame) === waiter.type) {
                        waiter.resolve(frame);
                    } else {
                        waiters.push(waiter);
                    }
                }
                return true;
            },
        },
        next: (type: string) => {
            const { promise, resolve } = Promise.withResolvers<unknown>();
            waiters.push({ resolve, type });
            return promise;
        },
        results: () =>
            frames
                .filter((frame): frame is InvokeResult => typeOf(frame) === 'invoke-result')
                .map(({ invocationId, outcome, output }) => ({
                    invocationId,
                    outcome,
                    text: output.kind === 'text' ? output.text : output.kind,
                })),
    };
}

export function invokeFrame(
    agentId: string,
    invocationId: string,
    operation: Record<string, unknown>,
    sessionGeneration = 1
) {
    return {
        agentId,
        invocationId,
        notAfter: '2999-01-01T00:00:00.000Z',
        operation,
        runId: 'run-1',
        sessionGeneration,
        timeoutMs: 30_000,
        type: 'invoke',
    };
}

function typeOf(frame: unknown) {
    return typeof frame === 'object' && frame !== null && 'type' in frame ? frame.type : undefined;
}
