import { existsSync } from 'node:fs';
import { Data, Effect, Exit } from 'effect';

export interface ReminderScriptChild {
    exited: Promise<number>;
    stderr: ReadableStream<Uint8Array>;
    stdout: ReadableStream<Uint8Array>;
}

export interface ReminderScriptExecution {
    exitCode: number;
    output: string;
    timedOut: boolean;
}

type ReminderScriptOperation = 'process-abort' | 'process-settlement' | 'process-spawn';

export class ReminderScriptExecutionFailure extends Data.TaggedError(
    'ReminderScriptExecutionFailure'
)<{
    readonly cause: unknown;
    readonly operation: ReminderScriptOperation;
}> {
    constructor(args: { cause: unknown; operation: ReminderScriptOperation }) {
        super(args);
        this.message = args.cause instanceof Error ? args.cause.message : 'Reminder script failed.';
    }
}

interface ReminderScriptSpawnInput {
    cwd: string;
    env: Record<string, string>;
    script: string;
    signal: AbortSignal;
}

export interface ReminderScriptExecutionDependencies {
    sleep: (durationMs: number) => Effect.Effect<void>;
    spawn: (input: ReminderScriptSpawnInput) => ReminderScriptChild;
}

export type ReminderScriptExecutionRunner = (input: {
    cwd: string;
    env: Record<string, string>;
    script: string;
}) => Effect.Effect<ReminderScriptExecution, ReminderScriptExecutionFailure>;

const timeoutMs = 60_000;
// The macOS login shell; Linux hosts often ship without zsh.
const reminderShell = existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash';
const maxOutputBytes = 65_536;

export const liveReminderScriptExecution = createReminderScriptExecution({
    sleep: (durationMs) => Effect.sleep(durationMs),
    spawn: ({ cwd, env, script, signal }) =>
        Bun.spawn([reminderShell, '-lc', script], {
            cwd,
            env,
            signal,
            stderr: 'pipe',
            stdout: 'pipe',
        }),
});

export function createReminderScriptExecution(
    dependencies: ReminderScriptExecutionDependencies
): ReminderScriptExecutionRunner {
    return (input) =>
        Effect.scoped(
            Effect.acquireUseRelease(
                Effect.try({
                    catch: (cause) =>
                        new ReminderScriptExecutionFailure({
                            cause,
                            operation: 'process-spawn',
                        }),
                    try: () => spawnChild(dependencies, input),
                }),
                (process) =>
                    Effect.gen(function* () {
                        yield* Effect.forkScoped(
                            dependencies
                                .sleep(timeoutMs)
                                .pipe(
                                    Effect.andThen(abortProcess(process, 'timeout')),
                                    Effect.asVoid
                                )
                        );
                        const settled = yield* awaitSettlement(process);
                        return settled.timedOut
                            ? { ...settled, exitCode: 124 }
                            : { ...settled, timedOut: false };
                    }),
                (process, exit) =>
                    Exit.isFailure(exit)
                        ? abortProcess(process, 'release').pipe(
                              Effect.andThen(awaitSettlement(process)),
                              Effect.asVoid,
                              // Finalizers are total; retain a cleanup failure in the complete Cause.
                              Effect.orDie
                          )
                        : Effect.void
            )
        );
}

function spawnChild(
    dependencies: ReminderScriptExecutionDependencies,
    input: { cwd: string; env: Record<string, string>; script: string }
) {
    const controller = new AbortController();
    let state: ProcessState = { _tag: 'running' };
    const abort = (reason: AbortReason) => {
        if (state._tag !== 'running') {
            return false;
        }
        state = { _tag: 'aborting', reason };
        controller.abort();
        return true;
    };
    const child = dependencies.spawn({ ...input, signal: controller.signal });
    const exited = child.exited.then(
        (exitCode) => ({ exitCode, timedOut: settleExit() }),
        () => ({ exitCode: 1, timedOut: settleExit() })
    );
    const settlement = Promise.allSettled([
        readLimited(child.stdout, maxOutputBytes),
        readLimited(child.stderr, maxOutputBytes),
        exited,
    ]).then(([stdout, stderr, exit]) => {
        if (stdout.status === 'rejected') {
            throw stdout.reason;
        }
        if (stderr.status === 'rejected') {
            throw stderr.reason;
        }
        if (exit.status === 'rejected') {
            throw exit.reason;
        }
        return {
            exitCode: exit.value.exitCode,
            output: truncateUtf8(
                [stdout.value, stderr.value].filter(Boolean).join('\n'),
                maxOutputBytes
            ),
            timedOut: exit.value.timedOut,
        };
    });

    function settleExit() {
        const timedOut = state._tag === 'aborting' && state.reason === 'timeout';
        state = { _tag: 'exit-settled', timedOut };
        return timedOut;
    }

    return { abort, settlement };
}

function awaitSettlement(process: { settlement: Promise<ReminderScriptExecution> }) {
    return Effect.tryPromise({
        catch: (cause) =>
            new ReminderScriptExecutionFailure({ cause, operation: 'process-settlement' }),
        try: () => process.settlement,
    });
}

function abortProcess(
    process: { abort: (reason: AbortReason) => boolean },
    reason: AbortReason
): Effect.Effect<boolean, ReminderScriptExecutionFailure> {
    return Effect.try({
        catch: (cause) => new ReminderScriptExecutionFailure({ cause, operation: 'process-abort' }),
        try: () => process.abort(reason),
    });
}

type AbortReason = 'release' | 'timeout';

type ProcessState =
    | { _tag: 'running' }
    | { _tag: 'aborting'; reason: AbortReason }
    | { _tag: 'exit-settled'; timedOut: boolean };

async function readLimited(stream: ReadableStream<Uint8Array>, limit: number): Promise<string> {
    const chunks: Uint8Array[] = [];
    let retained = 0;
    for await (const chunk of stream) {
        if (retained < limit) {
            const prefix = chunk.subarray(0, limit - retained);
            chunks.push(Uint8Array.from(prefix));
            retained += prefix.byteLength;
        }
    }
    return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))));
}

function truncateUtf8(value: string, maxBytes: number): string {
    let bytes = 0;
    let result = '';
    for (const character of value) {
        const characterBytes = Buffer.byteLength(character);
        if (bytes + characterBytes > maxBytes) {
            break;
        }
        bytes += characterBytes;
        result += character;
    }
    return result;
}
