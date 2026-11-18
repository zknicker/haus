import { settle } from '@haus/effect';
import { Effect, Exit, Fiber, Scope } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { type CloudAgentOperationError, foreign } from './foreign-operation.ts';

/** Accepted launches finish their durable journal writes before daemon shutdown. */
export class CloudAgentLaunchScope {
    private readonly scope: Scope.CloseableScope;
    private closePromise: Promise<void> | null = null;
    private readonly running = new Set<Fiber.RuntimeFiber<unknown, CloudAgentOperationError>>();

    constructor(private readonly runtime: DaemonRuntime) {
        this.scope = runtime.runSync(Scope.make());
    }

    run<Value>(operation: () => Promise<Value>): Promise<Value> {
        if (this.closePromise) {
            return Promise.reject(new Error('The Computer is shutting down.'));
        }
        const fiber = this.runtime.runSync(Effect.forkIn(foreign(operation), this.scope));
        this.running.add(fiber);
        fiber.addObserver(() => this.running.delete(fiber));
        return settle(
            this.runtime,
            Fiber.join(fiber).pipe(Effect.mapError((error) => error.cause))
        );
    }

    close(): Promise<void> {
        this.closePromise ??= settle(
            this.runtime,
            Effect.forEach([...this.running], Fiber.await, { discard: true }).pipe(
                Effect.zipRight(Scope.close(this.scope, Exit.succeed(undefined)))
            )
        );
        return this.closePromise;
    }
}
