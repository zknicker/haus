import type { ClaudeUsageSnapshot } from '@haus/claude-usage';
import { settle } from '@haus/effect';
import { Data, Effect, Stream } from 'effect';
import type { DaemonRuntime } from '../daemon-runtime.ts';
import type { createComputerActivityProjector } from './activity-projector.ts';
import type { HarnessTurnResult } from './executor.ts';
import {
    fatalRuntimeSessionFailure,
    type RuntimeSessionFailureError,
} from './runtime-session-failure.ts';
import type { ToolGate } from './stored-notice.ts';
import {
    addTokenUsage,
    type HarnessTokenUsage,
    readClaudePlanUsageMetadata,
    readTokenUsage,
    usageContextTokens,
} from './token-usage.ts';

/** A settled provider failure that may still have billable token usage. */
export class HarnessTurnFailedError extends Error {
    constructor(
        readonly tokenUsage: HarnessTokenUsage | null,
        options: { cause: unknown }
    ) {
        super(
            options.cause instanceof Error ? options.cause.message : String(options.cause),
            options
        );
        this.name = 'HarnessTurnFailedError';
    }
}

export class HarnessStreamForeignError extends Data.TaggedError('HarnessStreamForeignError')<{
    readonly cause: unknown;
}> {}

/** Observes execution evidence and terminal state; durable replies leave through the CLI. */
export async function observeTurnStream(
    stream: AsyncIterable<unknown>,
    toolCalls: ToolGate | undefined,
    projector: ReturnType<typeof createComputerActivityProjector> | undefined,
    {
        onFirstPart,
        onToolCall,
        runtime,
        signal,
        stallLabel,
        stallAfterMs = 120_000,
    }: {
        onFirstPart?: () => void | Promise<void>;
        onToolCall?: () => void;
        runtime: DaemonRuntime;
        signal?: AbortSignal;
        stallAfterMs?: number;
        stallLabel?: string;
    }
): Promise<HarnessTurnResult> {
    let contextTokens: number | null = null;
    let finalTokenUsage: HarnessTokenUsage | null = null;
    let claudePlanUsage: ClaudeUsageSnapshot | null = null;
    let stepTokenUsage: HarnessTokenUsage | null = null;
    let streamError: unknown;
    let fatalFailure: RuntimeSessionFailureError | null = null;
    let aborted = false;
    // Last-part timing distinguishes provider silence from a bridge that never emitted.
    let lastPartAt = Date.now();
    let lastPartType = 'none yet';
    let partCount = 0;
    const consume = Stream.fromAsyncIterable(
        stream,
        (cause) => new HarnessStreamForeignError({ cause })
    ).pipe(
        // Stop at a fatal retry warning: the runtime keeps retrying behind it until the
        // failed turn destroys its session.
        Stream.takeUntil((part) => fatalRetry(part)),
        Stream.runForEach((part) =>
            Effect.tryPromise({
                catch: (cause) => new HarnessStreamForeignError({ cause }),
                try: async () => {
                    if (!isRecord(part) || typeof part.type !== 'string') {
                        return;
                    }
                    lastPartAt = Date.now();
                    lastPartType = part.type;
                    partCount += 1;
                    if (partCount === 1) {
                        await onFirstPart?.();
                    }
                    switch (part.type) {
                        case 'raw':
                            fatalFailure ??= fatalRuntimeSessionFailure(part.rawValue);
                            await projector?.observe(part);
                            return;
                        case 'reasoning-delta':
                        case 'reasoning-end':
                        case 'reasoning-start':
                            await projector?.observe(part);
                            return;
                        case 'tool-call':
                            onToolCall?.();
                            toolCalls?.toolCallStarted(part);
                            await projector?.observe(part);
                            return;
                        case 'tool-error':
                        case 'tool-result':
                            await projector?.observe(part);
                            await toolCalls?.toolCallSettled(part);
                            return;
                        case 'finish-step':
                            contextTokens = usageContextTokens(part.usage) ?? contextTokens;
                            stepTokenUsage = addTokenUsage(
                                stepTokenUsage,
                                readTokenUsage(part.usage)
                            );
                            return;
                        case 'finish':
                            contextTokens = usageContextTokens(part.totalUsage) ?? contextTokens;
                            finalTokenUsage = readTokenUsage(part.totalUsage);
                            claudePlanUsage = readClaudePlanUsageMetadata(part.providerMetadata);
                            return;
                        case 'error':
                            streamError ??= part.error ?? new Error('Harness stream failed.');
                            return;
                        case 'abort':
                            aborted = true;
                            return;
                        default:
                            return;
                    }
                },
            })
        ),
        Effect.catchAll((failure) =>
            Effect.sync(() => {
                streamError ??= failure.cause;
            })
        )
    );
    const watchdog = Effect.sleep('60 seconds').pipe(
        Effect.andThen(
            Effect.sync(() => Date.now() - lastPartAt).pipe(
                Effect.flatMap((silentForMs) =>
                    stallLabel && silentForMs >= stallAfterMs
                        ? Effect.logWarning('Harness turn stream stalled.').pipe(
                              Effect.annotateLogs({
                                  event: 'harness-turn-stream-stalled',
                                  eventCount: partCount,
                                  lastEventType: lastPartType,
                                  silentSeconds: Math.round(silentForMs / 1000),
                                  stallLabel,
                              })
                          )
                        : Effect.void
                )
            )
        ),
        Effect.forever
    );
    const program = Effect.scoped(
        Effect.gen(function* () {
            if (stallLabel) {
                yield* Effect.forkScoped(watchdog);
            }
            yield* consume;
            const tokenUsage = finalTokenUsage ?? stepTokenUsage;
            // A fatal failure outranks an abort the runtime reports while giving up.
            const failure = fatalFailure ?? streamError;
            if (aborted && !fatalFailure) {
                yield* finishProjector(projector, 'interrupted', streamError);
                return { aborted: true, claudePlanUsage, contextTokens, tokenUsage };
            }
            if (failure) {
                yield* finishProjector(projector, 'failed', failure);
                return yield* Effect.fail(
                    new HarnessTurnFailedError(tokenUsage, { cause: failure })
                );
            }
            yield* finishProjector(projector, 'completed');
            return { aborted: false, claudePlanUsage, contextTokens, tokenUsage };
        })
    ).pipe(
        Effect.onInterrupt(() =>
            finishProjector(projector, 'interrupted', streamError).pipe(Effect.ignore)
        )
    );
    return await settle(runtime, program, {
        mapFailure: (failure) =>
            failure instanceof HarnessStreamForeignError ? failure.cause : failure,
        onInterrupted: () => ({
            aborted: true,
            claudePlanUsage,
            contextTokens,
            tokenUsage: finalTokenUsage ?? stepTokenUsage,
        }),
        signal,
    });
}

function finishProjector(
    projector: ReturnType<typeof createComputerActivityProjector> | undefined,
    phase: 'completed' | 'failed' | 'interrupted',
    error?: unknown
) {
    return Effect.tryPromise({
        catch: (cause) => new HarnessStreamForeignError({ cause }),
        try: () => projector?.finish(phase, error) ?? Promise.resolve(),
    });
}

function fatalRetry(part: unknown): boolean {
    return (
        isRecord(part) &&
        part.type === 'raw' &&
        fatalRuntimeSessionFailure(part.rawValue)?.severity === 'warning'
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
