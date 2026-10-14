import { open, readFile, rm } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

export interface PidLockOptions {
    busyMessage: string;
    pollMs: number;
    timeoutMs: number;
}

/**
 * Cross-process lock file holding the owner's pid, with shlock(1) semantics:
 * atomic exclusive create, and a lock whose owner died is reclaimed.
 */
export async function withPidLock<T>(
    lock: string,
    options: PidLockOptions,
    operation: () => Promise<T>
): Promise<T> {
    const deadline = Date.now() + options.timeoutMs;
    while (!(await tryAcquire(lock))) {
        if (Date.now() >= deadline) {
            throw new Error(options.busyMessage);
        }
        await setTimeout(options.pollMs);
    }
    try {
        return await operation();
    } finally {
        await rm(lock, { force: true });
    }
}

export function processExists(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error instanceof Error && 'code' in error && error.code !== 'ESRCH';
    }
}

async function tryAcquire(lock: string) {
    try {
        const handle = await open(lock, 'wx', 0o600);
        try {
            await handle.writeFile(`${process.pid}\n`);
        } catch (error) {
            // An ownerless empty lock would never be reclaimed.
            await rm(lock, { force: true });
            throw error;
        } finally {
            await handle.close();
        }
        return true;
    } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
            throw error;
        }
    }
    const owner = Number.parseInt(await readFile(lock, 'utf8').catch(() => ''), 10);
    // An empty file is an owner mid-write; only a recorded dead pid is stale.
    if (Number.isSafeInteger(owner) && owner > 0 && !processExists(owner)) {
        await rm(lock, { force: true });
    }
    return false;
}
