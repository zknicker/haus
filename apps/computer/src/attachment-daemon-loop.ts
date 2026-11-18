import { asError, settle } from '@haus/effect';
import { Effect } from 'effect';
import { computerMachineUnlinkedExitCode } from './attachment-recovery.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';

export interface AttachmentConnectionOutcome {
    /** The socket opened, so the Server was reachable before this close. */
    connected: boolean;
    /** The Server deleted itself; the attachment partition is being purged. */
    deleted: boolean;
}

export interface AttachmentDaemonHooks {
    attachmentExists(): Promise<boolean>;
    connect(): Promise<AttachmentConnectionOutcome>;
    isTerminalUnlinkedError(error: unknown): boolean;
    log(message: string): void;
    markTerminalUnlinked(): Promise<void>;
    oneshot: boolean;
    /** Test seam; production uses the Effect clock. */
    sleep?: (ms: number) => Promise<void>;
    validate(): Promise<void>;
}

export const attachmentDaemonInitialRetryMs = 500;
export const attachmentDaemonMaxRetryMs = 15_000;

/**
 * Runs the attachment daemon until a terminal outcome and returns the process
 * exit code. Transient failures — a restarting Server, a refused socket, a
 * failed validation — never end the daemon: the dev resident spawns daemons
 * under `bun --watch`, where a finished script leaves an idle watcher holding
 * the daemon's pid, so the resident's pid-liveness check would never respawn
 * it. The daemon owns its reconnect with capped exponential backoff instead,
 * exiting only for terminal unlink, Server deletion, a detached Server, or
 * oneshot test runs.
 */
export function runAttachmentDaemon(
    runtime: DaemonRuntime,
    hooks: AttachmentDaemonHooks
): Promise<number> {
    return settle(runtime, attachmentDaemonEffect(hooks));
}

function attachmentDaemonEffect(hooks: AttachmentDaemonHooks): Effect.Effect<number, Error> {
    let retryMs = attachmentDaemonInitialRetryMs;
    const attempt = <A>(operation: () => Promise<A>) =>
        Effect.tryPromise({ catch: asError, try: operation });
    const retry = (reason: string) => {
        const delayMs = retryMs;
        retryMs = Math.min(retryMs * 2, attachmentDaemonMaxRetryMs);
        return Effect.sync(() =>
            hooks.log(`Reconnecting to the Server in ${delayMs}ms: ${reason}`)
        ).pipe(
            Effect.andThen(
                hooks.sleep
                    ? attempt(() => hooks.sleep?.(delayMs) ?? Promise.resolve())
                    : Effect.sleep(delayMs)
            )
        );
    };
    const loop: Effect.Effect<number, Error> = Effect.suspend(() =>
        attempt(hooks.attachmentExists).pipe(
            Effect.catchAll((error) =>
                hooks.oneshot ? Effect.fail(error) : retry(error.message).pipe(Effect.andThen(loop))
            ),
            Effect.flatMap((exists) => {
                if (typeof exists === 'number') {
                    return Effect.succeed(exists);
                }
                if (!exists) {
                    return Effect.succeed(0);
                }
                return attempt(hooks.validate).pipe(
                    Effect.catchAll((error) => {
                        if (hooks.isTerminalUnlinkedError(error)) {
                            return attempt(hooks.markTerminalUnlinked).pipe(
                                Effect.as(computerMachineUnlinkedExitCode)
                            );
                        }
                        if (hooks.oneshot) {
                            return Effect.fail(error);
                        }
                        return retry(error.message).pipe(Effect.andThen(loop));
                    }),
                    Effect.flatMap((validationResult) => {
                        if (typeof validationResult === 'number') {
                            return Effect.succeed(validationResult);
                        }
                        return attempt(hooks.connect).pipe(
                            Effect.catchAll((error) =>
                                hooks.oneshot
                                    ? Effect.fail(error)
                                    : retry(error.message).pipe(Effect.andThen(loop))
                            ),
                            Effect.flatMap((outcome) => {
                                if (typeof outcome === 'number') {
                                    return Effect.succeed(outcome);
                                }
                                if (outcome.deleted) {
                                    return Effect.succeed(0);
                                }
                                if (hooks.oneshot) {
                                    return Effect.succeed(outcome.connected ? 0 : 1);
                                }
                                if (outcome.connected) {
                                    retryMs = attachmentDaemonInitialRetryMs;
                                }
                                return retry(
                                    outcome.connected
                                        ? 'the Server closed the attachment socket'
                                        : 'the attachment socket did not open'
                                ).pipe(Effect.andThen(loop));
                            })
                        );
                    })
                );
            })
        )
    );
    return loop;
}
