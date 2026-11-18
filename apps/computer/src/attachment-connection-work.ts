import { asError, settle } from '@haus/effect';
import { type Duration, Effect, Exit, Schedule, Scope } from 'effect';
import type { DaemonRuntime } from './daemon-runtime.ts';

/** Owns recurring work that must stop with one attachment WebSocket. */
export class AttachmentConnectionWork {
    private closePromise: Promise<void> | null = null;

    private constructor(
        private readonly runtime: DaemonRuntime,
        private readonly scope: Scope.CloseableScope
    ) {}

    static async make(runtime: DaemonRuntime): Promise<AttachmentConnectionWork> {
        return new AttachmentConnectionWork(runtime, await settle(runtime, Scope.make()));
    }

    startLoop(
        interval: Duration.DurationInput,
        operation: (signal: AbortSignal) => Promise<void>,
        onFailure: (error: Error) => void
    ): void {
        if (this.closePromise) {
            return;
        }
        const attempt = Effect.tryPromise({ catch: asError, try: operation }).pipe(
            Effect.catchAll((error) => Effect.sync(() => onFailure(error)))
        );
        const loop = Effect.sleep(interval).pipe(
            Effect.zipRight(attempt.pipe(Effect.repeat(Schedule.fixed(interval)))),
            Effect.asVoid
        );
        this.runtime.runSync(Effect.forkIn(loop, this.scope));
    }

    close(): Promise<void> {
        this.closePromise ??= settle(
            this.runtime,
            Scope.close(this.scope, Exit.succeed(undefined))
        );
        return this.closePromise;
    }
}
