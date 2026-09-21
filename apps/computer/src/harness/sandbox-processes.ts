import { type ChildProcessWithoutNullStreams, spawn as spawnProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Experimental_SandboxProcess } from '@ai-sdk/provider-utils';
import { type EffectRuntime, settle } from '@haus/effect';
import { Effect, Exit, Scope } from 'effect';
import { sandboxProcessOwner } from './sandbox-process-owner.ts';

const TERMINATION_GRACE_MS = 1000;
const TERMINATION_POLL_MS = 10;
const GROUP_REAP_INTERVAL_MS = 1000;
export interface SandboxProcessOptions {
    abortSignal?: AbortSignal;
    command: string;
    env?: Record<string, string>;
    workingDirectory?: string;
}

interface TrackedProcess {
    child: ChildProcessWithoutNullStreams;
    groupExitCheck?: ReturnType<typeof setTimeout>;
    hasExited: boolean;
    markOwnedExit(): void;
    ownedExit: Promise<void>;
    ownershipReleased: boolean;
    processGroupId?: number;
    runtime: EffectRuntime<never>;
    terminationOutcome?: Promise<TerminationOutcome>;
    waitOutcome: Promise<ProcessWaitOutcome>;
}

type ProcessWaitOutcome = { error: unknown; kind: 'error' } | { exitCode: number; kind: 'exit' };
type TerminationOutcome = { error: unknown; kind: 'error' } | { kind: 'exit' };

/** Owns every child process created by one Harness sandbox session. */
export function createSandboxProcessRegistry(options: {
    defaultWorkingDirectory: string;
    env: Record<string, string>;
    resolveWorkingDirectory(value: string): string;
    runtime: EffectRuntime<never>;
}) {
    const owner = sandboxProcessOwner(options.runtime);
    owner.assertOpen();
    const processes = new Set<TrackedProcess>();
    const scope = options.runtime.runSync(Scope.make());
    let closePromise: Promise<void> | null = null;
    options.runtime.runSync(
        Scope.addFinalizer(
            scope,
            Effect.promise(() => stopProcesses(processes))
        )
    );

    const close = () => {
        closePromise ??= settle(
            options.runtime,
            Scope.close(scope, Exit.succeed(undefined))
        ).finally(() => owner.remove(close));
        return closePromise;
    };
    owner.add(close);

    return {
        destroy: close,
        async spawn(spawnOptions: SandboxProcessOptions): Promise<Experimental_SandboxProcess> {
            const cwd = options.resolveWorkingDirectory(
                spawnOptions.workingDirectory ?? options.defaultWorkingDirectory
            );
            owner.assertOpen();
            if (closePromise) {
                throw new Error('Sandbox session is closed.');
            }
            await mkdir(cwd, { recursive: true });
            owner.assertOpen();
            if (closePromise) {
                throw new Error('Sandbox session is closed.');
            }
            const child = spawnProcess(spawnOptions.command, {
                cwd,
                detached: process.platform !== 'win32',
                env: { ...process.env, ...options.env, ...spawnOptions.env },
                shell: process.env.SHELL ?? true,
                signal: spawnOptions.abortSignal,
            });
            const tracked = trackProcess(child, options.runtime);
            processes.add(tracked);
            void tracked.ownedExit.then(() => processes.delete(tracked));
            return {
                kill: () => terminateProcess(tracked),
                pid: child.pid,
                stderr: Readable.toWeb(child.stderr) as ReadableStream<Uint8Array>,
                stdout: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
                wait: async () => {
                    const outcome = await tracked.waitOutcome;
                    if (outcome.kind === 'error') {
                        if (isSystemErrorCode(outcome.error, 'ABORT_ERR')) {
                            await getTerminationOutcome(tracked);
                        }
                        throw outcome.error;
                    }
                    return { exitCode: outcome.exitCode };
                },
            };
        },
        stop: close,
    };
}

function trackProcess(
    child: ChildProcessWithoutNullStreams,
    runtime: EffectRuntime<never>
): TrackedProcess {
    let markOwnedExit: (() => void) | undefined;
    let settleWait: ((outcome: ProcessWaitOutcome) => void) | undefined;
    const tracked: TrackedProcess = {
        child,
        hasExited: false,
        markOwnedExit: () => {
            if (tracked.ownershipReleased) {
                return;
            }
            tracked.ownershipReleased = true;
            cancelGroupExitCheck(tracked);
            markOwnedExit?.();
        },
        ownedExit: new Promise<void>((resolve) => {
            markOwnedExit = resolve;
        }),
        ownershipReleased: false,
        processGroupId: process.platform === 'win32' ? undefined : child.pid,
        runtime,
        waitOutcome: new Promise<ProcessWaitOutcome>((resolve) => {
            settleWait = resolve;
        }),
    };
    child.on('error', (error) => {
        settleWait?.({ error, kind: 'error' });
        if (isSystemErrorCode(error, 'ABORT_ERR')) {
            void getTerminationOutcome(tracked);
        }
        if (child.pid === undefined) {
            tracked.hasExited = true;
            tracked.markOwnedExit();
        }
    });
    child.once('close', (code) => {
        tracked.hasExited = true;
        settleWait?.({ exitCode: code ?? 0, kind: 'exit' });
        monitorProcessGroupExit(tracked);
    });
    return tracked;
}

async function terminateProcess(tracked: TrackedProcess): Promise<void> {
    const outcome = await getTerminationOutcome(tracked);
    if (outcome.kind === 'error') {
        throw outcome.error;
    }
}

function getTerminationOutcome(tracked: TrackedProcess): Promise<TerminationOutcome> {
    tracked.terminationOutcome ??= stopProcess(tracked).then(
        () => ({ kind: 'exit' }),
        (error: unknown) => ({ error, kind: 'error' })
    );
    return tracked.terminationOutcome;
}

async function stopProcesses(processes: Set<TrackedProcess>): Promise<void> {
    const trackedProcesses = [...processes];
    const results = await Promise.all(trackedProcesses.map(getTerminationOutcome));
    for (const tracked of trackedProcesses) {
        cancelGroupExitCheck(tracked);
    }
    processes.clear();
    const failures = results.flatMap((result) => (result.kind === 'error' ? [result.error] : []));
    if (failures.length === 1) {
        throw failures[0];
    }
    if (failures.length > 1) {
        throw new AggregateError(failures, 'Sandbox processes did not terminate.');
    }
}

async function stopProcess(process: TrackedProcess): Promise<void> {
    try {
        signalOwnedProcess(process, 'SIGTERM');
        cancelGroupExitCheck(process);
        monitorProcessGroupExit(process, TERMINATION_POLL_MS);
        if (await waitForOwnedExit(process, TERMINATION_GRACE_MS)) {
            process.markOwnedExit();
            return;
        }
        signalOwnedProcess(process, 'SIGKILL');
        if (await waitForOwnedExit(process, TERMINATION_GRACE_MS)) {
            process.markOwnedExit();
            return;
        }
        throw new Error(`Sandbox process ${process.child.pid ?? 'unknown'} did not terminate.`);
    } finally {
        if (!process.ownershipReleased) {
            cancelGroupExitCheck(process);
        }
    }
}

async function waitForOwnedExit(tracked: TrackedProcess, timeoutMs: number): Promise<boolean> {
    return settle(
        tracked.runtime,
        Effect.race(
            ownedExitEffect(tracked).pipe(Effect.as(true)),
            Effect.sleep(timeoutMs).pipe(Effect.as(false))
        )
    );
}

function ownedExitEffect(tracked: TrackedProcess): Effect.Effect<void> {
    return Effect.promise(
        (signal) =>
            new Promise<void>((resolve) => {
                const finish = () => {
                    signal.removeEventListener('abort', finish);
                    resolve();
                };
                if (signal.aborted) {
                    finish();
                    return;
                }
                signal.addEventListener('abort', finish, { once: true });
                void tracked.ownedExit.then(finish);
            })
    );
}

function monitorProcessGroupExit(tracked: TrackedProcess, pollMs = GROUP_REAP_INTERVAL_MS): void {
    if (tracked.ownershipReleased || tracked.groupExitCheck !== undefined) {
        return;
    }
    try {
        if (tracked.hasExited && !isProcessGroupAlive(tracked.processGroupId)) {
            tracked.markOwnedExit();
            return;
        }
    } catch {
        // Retain ownership so session shutdown can report the inspection failure.
        return;
    }
    tracked.groupExitCheck = setTimeout(() => {
        tracked.groupExitCheck = undefined;
        monitorProcessGroupExit(tracked, pollMs);
    }, pollMs);
    tracked.groupExitCheck.unref();
}

function cancelGroupExitCheck(tracked: TrackedProcess): void {
    clearTimeout(tracked.groupExitCheck);
    tracked.groupExitCheck = undefined;
}

function isProcessGroupAlive(processGroupId: number | undefined): boolean {
    if (processGroupId === undefined) {
        return false;
    }
    try {
        process.kill(-processGroupId, 0);
        return true;
    } catch (error) {
        if (isSystemErrorCode(error, 'ESRCH')) {
            return false;
        }
        if (isSystemErrorCode(error, 'EPERM')) {
            return true;
        }
        throw error;
    }
}

function signalOwnedProcess(tracked: TrackedProcess, signal: NodeJS.Signals): void {
    if (tracked.ownershipReleased) {
        return;
    }
    try {
        if (tracked.processGroupId !== undefined) {
            process.kill(-tracked.processGroupId, signal);
            return;
        }
        tracked.child.kill(signal);
    } catch (error) {
        if (!isSystemErrorCode(error, 'ESRCH')) {
            throw error;
        }
    }
}

function isSystemErrorCode(error: unknown, code: string): boolean {
    return error instanceof Error && 'code' in error && error.code === code;
}
