import { Effect, type Exit, Option, Ref, Scope } from 'effect';

export interface HausServerShutdownResources {
    broadcastReconnectNotification(): void;
    closeComputerSocket(): Promise<void> | void;
    closeDatabase(): Promise<void>;
    closeFastify(): Promise<void>;
    closeHttpConnections(): void;
    closeMcpRuntime(): Promise<void>;
    closePostCommitWork(): Promise<void>;
    closeRecurringWork(): Promise<void>;
    closeWebSocketServer(): Promise<void> | void;
}

export interface HausServerShutdown {
    close(
        scope: Scope.CloseableScope,
        exit: Exit.Exit<unknown, unknown>
    ): Effect.Effect<void, unknown>;
    register(resources: HausServerShutdownResources): Effect.Effect<void, never, Scope.Scope>;
}

/**
 * Owns Server teardown in one sequential Scope. Finalizers are registered in
 * reverse so Scope's LIFO release order stays the public shutdown contract.
 */
export function makeHausServerShutdown(): Effect.Effect<HausServerShutdown> {
    return Ref.make<Option.Option<unknown>>(Option.none()).pipe(
        Effect.map((firstFailure) => ({
            close: (scope, exit) =>
                Effect.gen(function* () {
                    yield* Scope.close(scope, exit);
                    const failure = yield* Ref.get(firstFailure);
                    if (Option.isSome(failure)) {
                        return yield* Effect.fail(failure.value);
                    }
                }),
            register: (resources) =>
                Effect.gen(function* () {
                    for (const step of shutdownSteps(resources)) {
                        yield* Effect.addFinalizer(() =>
                            Effect.tryPromise({
                                catch: (cause) => cause,
                                try: () => Promise.resolve().then(step),
                            }).pipe(
                                Effect.catchAll((failure) =>
                                    Ref.update(firstFailure, (current) =>
                                        Option.isSome(current) ? current : Option.some(failure)
                                    )
                                )
                            )
                        );
                    }
                }),
        }))
    );
}

function shutdownSteps(
    resources: HausServerShutdownResources
): ReadonlyArray<() => Promise<void> | void> {
    return [
        () => resources.closeDatabase(),
        () => resources.closePostCommitWork(),
        () => resources.closeFastify(),
        () => resources.closeMcpRuntime(),
        () => resources.closeComputerSocket(),
        () => resources.closeHttpConnections(),
        () => resources.closeWebSocketServer(),
        () => resources.closeRecurringWork(),
        () => resources.broadcastReconnectNotification(),
    ];
}
