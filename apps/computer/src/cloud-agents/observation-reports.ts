import { isTerminalCloudAgentStatus } from '@haus/api';
import { Deferred, Effect, Exit, Option, Queue } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import { CloudAgentOperationError, foreign } from './foreign-operation.ts';
import type { CloudAgentProviderObservation } from './provider.ts';

export type EnrichObservation = (
    observation: CloudAgentProviderObservation,
    signal: AbortSignal
) => Promise<CloudAgentProviderObservation>;
interface Report {
    delivered: Deferred.Deferred<void, CloudAgentOperationError>;
    observation: CloudAgentProviderObservation;
}

/** One scoped consumer preserves provider order while GitHub evidence is loading. */
export class ObservationReports {
    private readonly queue: Queue.Queue<Report>;
    private closed = false;
    private terminalQueued = false;

    constructor(
        private readonly runtime: DaemonRuntime,
        private readonly enrich: EnrichObservation,
        private readonly deliver: (observation: CloudAgentProviderObservation) => void
    ) {
        this.queue = runtime.runSync(Queue.dropping<Report>(32));
    }

    enqueue(observation: CloudAgentProviderObservation): void {
        if (this.closed) {
            return;
        }
        const delivered = this.runtime.runSync(Deferred.make<void, CloudAgentOperationError>());
        this.runtime.runSync(this.offer({ delivered, observation }));
    }

    publish(
        observation: CloudAgentProviderObservation
    ): Effect.Effect<void, CloudAgentOperationError> {
        const self = this;
        return Effect.gen(function* () {
            const delivered = yield* Deferred.make<void, CloudAgentOperationError>();
            yield* self.offer({ delivered, observation });
            yield* Deferred.await(delivered);
        });
    }

    private offer(report: Report): Effect.Effect<void> {
        const self = this;
        return Effect.gen(function* () {
            if (self.closed || self.terminalQueued) {
                yield* Deferred.succeed(report.delivered, undefined);
                return;
            }
            const terminal = isTerminalCloudAgentStatus(report.observation.status);
            if (!(yield* Queue.offer(self.queue, report))) {
                if (!terminal) {
                    yield* Deferred.succeed(report.delivered, undefined);
                    return;
                }
                const dropped = yield* Queue.poll(self.queue);
                if (Option.isSome(dropped)) {
                    yield* Deferred.succeed(dropped.value.delivered, undefined);
                }
                yield* Queue.offer(self.queue, report);
            }
            self.terminalQueued = terminal;
        });
    }

    consume(): Effect.Effect<void> {
        const self = this;
        return Effect.forever(
            Effect.gen(function* () {
                const report = yield* Queue.take(self.queue);
                const observation = yield* foreign((signal) =>
                    self.enrich(report.observation, signal)
                ).pipe(Effect.catchAll(() => Effect.succeed(report.observation)));
                const delivered = yield* Effect.exit(
                    Effect.try({
                        try: () => self.deliver(observation),
                        catch: (cause) => new CloudAgentOperationError({ cause }),
                    })
                );
                if (Exit.isFailure(delivered)) {
                    self.terminalQueued = false;
                    yield* Effect.logWarning('Cloud Agent observation could not be delivered');
                }
                yield* Deferred.done(report.delivered, delivered);
            })
        ).pipe(
            Effect.ensuring(
                Effect.sync(() => {
                    self.closed = true;
                })
            )
        );
    }
}
