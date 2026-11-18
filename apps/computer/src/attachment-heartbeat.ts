import type { ComputerHeartbeatConfiguration } from '@haus/api';
import { settle } from '@haus/effect';
import { Effect, Exit, Queue, Scope } from 'effect';
import type { DaemonRuntime } from './daemon-runtime.ts';

export interface AttachmentHeartbeat {
    acceptAck(id: number): void;
    dispose(): void;
}

export function startAttachmentHeartbeat(input: {
    configuration: ComputerHeartbeatConfiguration;
    onTimeout?: () => void;
    runtime: DaemonRuntime;
    socket: WebSocket;
}): AttachmentHeartbeat {
    const { configuration, onTimeout, runtime, socket } = input;
    let disposed = false;
    let highestAcceptedId = -1;
    let highestSentId = -1;
    const scope = runtime.runSync(Scope.make());
    const acknowledgements = runtime.runSync(Queue.unbounded<void>());

    const dispose = () => {
        if (disposed) {
            return;
        }
        disposed = true;
        void settle(runtime, Scope.close(scope, Exit.succeed(undefined)), {
            onInterrupted: () => undefined,
        });
    };
    const terminate = () => {
        if (disposed) {
            return;
        }
        onTimeout?.();
        socket.terminate();
    };
    const sendHeartbeat = () => {
        if (socket.readyState !== WebSocket.OPEN) {
            return;
        }
        highestSentId += 1;
        socket.send(JSON.stringify({ id: highestSentId, type: 'heartbeat' }));
    };

    const sendLoop = Effect.forever(
        Effect.sync(sendHeartbeat).pipe(Effect.andThen(Effect.sleep(configuration.intervalMs)))
    );
    const watchDeadline: Effect.Effect<void> = Effect.suspend(() =>
        Effect.race(
            Queue.take(acknowledgements).pipe(Effect.as(true)),
            Effect.sleep(configuration.timeoutMs).pipe(Effect.as(false))
        ).pipe(
            Effect.flatMap((acknowledged) =>
                acknowledged ? watchDeadline : Effect.sync(terminate)
            )
        )
    );
    runtime.runSync(Effect.forkIn(sendLoop, scope));
    runtime.runSync(Effect.forkIn(watchDeadline, scope));

    return {
        acceptAck(id) {
            if (disposed || id <= highestAcceptedId || id > highestSentId) {
                return;
            }
            highestAcceptedId = id;
            runtime.runFork(Queue.offer(acknowledgements, undefined));
        },
        dispose,
    };
}
