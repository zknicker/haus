import { once } from 'node:events';
import { driveRemote } from './drive-remote.ts';
import { claimFolderPlacement } from './folder-placement.ts';
import { driveFolderLayout } from './folder-state.ts';
import { pullDrive } from './pull.ts';
import { planDrivePush, sendDrivePush } from './push.ts';

const folderTurns = new Map<string, Promise<unknown>>();
const discardedFolders = new Set<string>();

export function discardDrivePushes(agentRoot: string) {
    discardedFolders.add(agentRoot);
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

export interface DriveRun {
    agentId: string;
    current: () => boolean;
    now: () => number;
    mint: () => Promise<{ runnerId: string; runnerToken: string }>;
    placementGeneration: number;
    revoke: (runnerId: string) => Promise<unknown>;
    runId: string;
    serverOrigin: string;
    warn: (event: string, detail: string) => void;
}

export function pullDriveForRun(agentRoot: string, run: DriveRun) {
    return inFolderTurn(agentRoot, async () => {
        if (!(await mayTouchFolder(agentRoot, run))) {
            return;
        }
        await withRunToken(run, 'drive-pull-failed', async (token) => {
            const pulled = await pullDrive({
                layout: driveFolderLayout(agentRoot, run.agentId),
                remote: driveRemote({ serverOrigin: run.serverOrigin, token }),
            });
            for (const file of pulled.held) {
                run.warn('drive-pull-held', `${file.path}: ${file.message}`);
            }
            if (!pulled.advanced) {
                run.warn('drive-pull-blocked', `${pulled.blocked} local paths blocked`);
            }
        });
    });
}

export function pushDriveForRun(agentRoot: string, run: DriveRun) {
    return inFolderTurn(agentRoot, async () => {
        if (!(await mayTouchFolder(agentRoot, run))) {
            return;
        }
        const plan = await planDrivePush(driveFolderLayout(agentRoot, run.agentId));
        if (plan.isEmpty) {
            return;
        }
        await withRunToken(run, 'drive-push-failed', async (token) => {
            const remote = driveRemote({ serverOrigin: run.serverOrigin, token });
            const pushed = await sendDrivePush(plan, remote, run.runId);
            if (pushed.pushClosed) {
                run.warn('drive-push-closed', `Push ${run.runId} was already closed.`);
            }
            for (const file of pushed.failed) {
                run.warn('drive-push-file-failed', `${file.path}: ${file.message}`);
            }
            for (const file of pushed.unrestored) {
                run.warn('drive-restore-failed', `${file.path}: ${file.message}`);
            }
        });
    });
}

export function flushDriveForRun(agentRoot: string, run: DriveRun) {
    return inFolderTurn(agentRoot, async () => {
        if (!(await mayTouchFolder(agentRoot, run))) {
            return;
        }
        const plan = await planDrivePush(driveFolderLayout(agentRoot, run.agentId));
        await withRunToken(run, 'drive-flush-failed', async (token) => {
            const remote = driveRemote({ serverOrigin: run.serverOrigin, token });
            const pushed = plan.isEmpty
                ? { failed: [], unrestored: [] }
                : await sendDrivePush(plan, remote, run.runId, {
                      closeIf: (failed) => failed.length === 0,
                  });
            for (const file of pushed.failed) {
                run.warn('drive-flush-file-failed', `${file.path}: ${file.message}`);
            }
            for (const file of pushed.unrestored) {
                run.warn('drive-restore-failed', `${file.path}: ${file.message}`);
            }
            if (pushed.failed.length === 0) {
                await remote.close(run.runId);
            }
        });
    });
}

async function mayTouchFolder(agentRoot: string, run: DriveRun) {
    if (!run.current() || discardedFolders.has(agentRoot)) {
        return false;
    }
    const layout = driveFolderLayout(agentRoot, run.agentId);
    return (await claimFolderPlacement(agentRoot, layout, run.placementGeneration)) !== 'stale';
}

async function withRunToken(
    run: DriveRun,
    failure: string,
    work: (token: () => Promise<string>) => Promise<void>
) {
    const minted: string[] = [];
    let held: { at: number; token: string } | null = null;
    const token = async () => {
        if (!held || run.now() - held.at >= tokenRenewMs) {
            const runner = await run.mint();
            minted.push(runner.runnerId);
            held = { at: run.now(), token: runner.runnerToken };
        }
        return held.token;
    };
    try {
        await work(token);
    } catch (error) {
        run.warn(failure, messageOf(error));
    } finally {
        for (const runnerId of minted) {
            await run
                .revoke(runnerId)
                .catch((error: unknown) => run.warn('drive-revoke-failed', messageOf(error)));
        }
    }
}

const tokenRenewMs = 10 * 60 * 1000;

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

async function abortOf(signal: AbortSignal) {
    if (!signal.aborted) {
        await once(signal, 'abort');
    }
}

function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
