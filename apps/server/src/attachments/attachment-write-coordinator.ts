import { asError, settle } from '@haus/effect';
import { Deferred, Effect } from 'effect';
import type { ServerRuntime } from '../server-runtime.ts';

interface ServerWriteState {
    active: number;
    deleting: boolean;
    quiescence: Deferred.Deferred<void> | null;
    quiescing: boolean;
    semaphore: Effect.Semaphore;
}

export class AttachmentWriteCoordinator {
    private readonly servers = new Map<string, ServerWriteState>();

    constructor(private readonly runtime: ServerRuntime) {}

    begin(serverId: string): () => void {
        const state = this.server(serverId);
        if (state.deleting || state.quiescing) {
            throw new Error('This Server attachment root is being deleted.');
        }
        state.active += 1;
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            state.active -= 1;
            if (state.active === 0 && state.quiescence) {
                this.runtime.runSync(Deferred.succeed(state.quiescence, undefined));
            }
        };
    }

    runExclusive<Result>(
        serverId: string,
        operation: () => Promise<Result>,
        options?: { signal?: AbortSignal }
    ): Promise<Result> {
        const state = this.server(serverId);
        if (state.deleting) {
            return Promise.reject(new Error('This Server attachment root is being deleted.'));
        }
        return this.run(state, operation, options);
    }

    runPermanentlyExclusive<Result>(
        serverId: string,
        operation: () => Promise<Result>,
        options?: { signal?: AbortSignal }
    ): Promise<Result> {
        const state = this.server(serverId);
        state.deleting = true;
        return this.run(state, operation, options);
    }

    private run<Result>(
        state: ServerWriteState,
        operation: () => Promise<Result>,
        options?: { signal?: AbortSignal }
    ): Promise<Result> {
        const program = state.semaphore.withPermits(1)(
            Effect.acquireUseRelease(
                Effect.sync(() => this.beginQuiescence(state)),
                (quiescence) =>
                    (quiescence ? Deferred.await(quiescence) : Effect.void).pipe(
                        Effect.andThen(
                            Effect.tryPromise({
                                catch: asError,
                                try: operation,
                            })
                        )
                    ),
                () =>
                    Effect.sync(() => {
                        state.quiescence = null;
                        state.quiescing = false;
                    })
            )
        );
        return settle(
            this.runtime,
            program,
            options?.signal === undefined ? undefined : { signal: options.signal }
        );
    }

    private beginQuiescence(state: ServerWriteState): Deferred.Deferred<void> | null {
        state.quiescing = true;
        state.quiescence = state.active === 0 ? null : this.runtime.runSync(Deferred.make<void>());
        return state.quiescence;
    }

    private server(serverId: string): ServerWriteState {
        const current = this.servers.get(serverId);
        if (current) {
            return current;
        }
        const created = {
            active: 0,
            deleting: false,
            quiescence: null,
            quiescing: false,
            semaphore: this.runtime.runSync(Effect.makeSemaphore(1)),
        } satisfies ServerWriteState;
        this.servers.set(serverId, created);
        return created;
    }
}
