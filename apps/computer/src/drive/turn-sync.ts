import { settle } from '@haus/effect';
import { Effect } from 'effect';
import type { RunAgentLaunchOptions } from '../launch.ts';
import { mintRunner, revokeRunner } from '../runner-authority.ts';
import { driveRemote } from './drive-remote.ts';
import { driveFolderLayout } from './folder-state.ts';
import { pullDrive } from './pull.ts';
import { planDrivePush, sendDrivePush } from './push.ts';

const folderTurns = new Map<string, Promise<unknown>>();
const discardedFolders = new Set<string>();
const pushAborts = new Map<string, AbortController>();

export function discardDrivePushes(agentRoot: string) {
    discardedFolders.add(agentRoot);
    pushAborts.get(agentRoot)?.abort();
    return () => {
        discardedFolders.delete(agentRoot);
    };
}

export async function settleDriveFolder(agentRoot: string) {
    await folderTurns.get(agentRoot);
}

export function holdDriveFolder(agentRoot: string, signal: AbortSignal, work: () => Promise<void>) {
    return inFolderTurn(agentRoot, work, signal);
}

export function pullDriveBeforeTurn(
    options: RunAgentLaunchOptions,
    agentRoot: string,
    runnerToken: string
) {
    return inFolderTurn(agentRoot, () => pullBeforeTurn(options, agentRoot, runnerToken));
}

export function pushDriveAfterTurn(options: RunAgentLaunchOptions, agentRoot: string) {
    return inFolderTurn(agentRoot, () => pushAfterTurn(options, agentRoot));
}

export interface DriveRun {
    agentId: string;
    mint: () => Promise<{ runnerId: string; runnerToken: string }>;
    revoke: (runnerId: string) => Promise<unknown>;
    runId: string;
    serverOrigin: string;
    warn: (event: string, detail: string) => void;
}

export function pullDriveForRun(agentRoot: string, run: DriveRun) {
    return inFolderTurn(agentRoot, () =>
        withRunToken(run, 'drive-pull-failed', async (token) => {
            const pulled = await pullDrive({
                layout: driveFolderLayout(agentRoot, run.agentId),
                remote: driveRemote({ serverOrigin: run.serverOrigin, token }),
            });
            if (!pulled.advanced) {
                run.warn('drive-pull-blocked', `${pulled.blocked} local paths blocked`);
            }
        })
    );
}

export function pushDriveForRun(agentRoot: string, run: DriveRun) {
    return inFolderTurn(agentRoot, async () => {
        if (discardedFolders.has(agentRoot)) {
            return;
        }
        const plan = await planDrivePush(driveFolderLayout(agentRoot, run.agentId));
        if (plan.isEmpty) {
            return;
        }
        await withRunToken(run, 'drive-push-failed', async (token) => {
            const remote = driveRemote({ serverOrigin: run.serverOrigin, token });
            const pushed = await sendDrivePush(plan, remote, run.runId);
            for (const file of pushed.failed) {
                run.warn('drive-push-file-failed', `${file.path}: ${file.message}`);
            }
        });
    });
}

async function withRunToken(
    run: DriveRun,
    failure: string,
    work: (token: string) => Promise<void>
) {
    try {
        const runner = await run.mint();
        try {
            await work(runner.runnerToken);
        } finally {
            await run.revoke(runner.runnerId).catch(() => undefined);
        }
    } catch (error) {
        run.warn(failure, messageOf(error));
    }
}

async function inFolderTurn(agentRoot: string, run: () => Promise<void>, signal?: AbortSignal) {
    const previous = folderTurns.get(agentRoot) ?? Promise.resolve();
    const next = (signal ? Promise.race([previous, abortOf(signal)]) : previous).then(run);
    const tail = Promise.allSettled([previous, next]);
    folderTurns.set(agentRoot, tail);
    void tail.then(() => {
        if (folderTurns.get(agentRoot) === tail) {
            folderTurns.delete(agentRoot);
        }
    });
    await next;
}

async function pullBeforeTurn(
    options: RunAgentLaunchOptions,
    agentRoot: string,
    runnerToken: string
) {
    try {
        const pulled = await pullDrive({
            layout: driveFolderLayout(agentRoot, options.command.agentId),
            remote: driveRemote({ serverOrigin: options.serverOrigin, token: runnerToken }),
        });
        if (!pulled.advanced) {
            await warn(options, 'drive-pull-blocked', `${pulled.blocked} local paths blocked`);
        }
    } catch (error) {
        await warn(options, 'drive-pull-failed', messageOf(error));
    }
}

async function pushAfterTurn(options: RunAgentLaunchOptions, agentRoot: string) {
    if (discardedFolders.has(agentRoot)) {
        return;
    }
    const abort = new AbortController();
    pushAborts.set(agentRoot, abort);
    try {
        const plan = await planDrivePush(driveFolderLayout(agentRoot, options.command.agentId));
        if (plan.isEmpty || abort.signal.aborted) {
            return;
        }
        const runner = await mintRunner(options);
        try {
            const remote = driveRemote({
                serverOrigin: options.serverOrigin,
                signal: abort.signal,
                token: runner.runnerToken,
            });
            const pushed = await sendDrivePush(plan, remote, options.command.runId);
            for (const file of pushed.failed) {
                await warn(options, 'drive-push-file-failed', `${file.path}: ${file.message}`);
            }
        } finally {
            await revokeRunner(options, runner.runnerId).catch(() => undefined);
        }
    } catch (error) {
        await warn(options, 'drive-push-failed', messageOf(error));
    } finally {
        pushAborts.delete(agentRoot);
    }
}

async function warn(options: RunAgentLaunchOptions, event: string, detail: string) {
    await settle(
        options.runtime,
        Effect.logWarning('Drive folder sync did not finish.').pipe(
            Effect.annotateLogs({
                agentId: options.command.agentId,
                detail,
                event,
                runId: options.command.runId,
            })
        )
    );
}

function abortOf(signal: AbortSignal) {
    return new Promise<void>((resolve) => {
        if (signal.aborted) {
            resolve();
            return;
        }
        signal.addEventListener('abort', () => resolve(), { once: true });
    });
}

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
