import { isProcessGroupAlive, isSystemErrorCode } from './process-group-liveness.ts';
import type { RuntimeProcessRegistry } from './process-registry.ts';

export interface ProcessGroupOwnership {
    /** A detached child's pid, which is also its process group id. */
    readonly pid: number | undefined;
    /** Settles once the group leader exited. */
    readonly exited: Promise<unknown>;
    /** Names the runtime in a termination failure. */
    readonly label: string;
    /** Ties the group to Computer shutdown until it is gone. */
    readonly processes?: RuntimeProcessRegistry;
    readonly graceMs?: number;
}

const DEFAULT_GRACE_MS = 2000;
const LIVENESS_POLL_MS = 25;

/**
 * Owns a runtime child's whole process group, not just its leader: a CLI's backgrounded shells
 * and tool servers outlive the leader unless the group is ended. Returns the group's termination
 * (SIGTERM, then SIGKILL), which resolves only once every member is gone. The group stays in the
 * Computer's process registry until then, and a leader that exits on its own still has its
 * group ended. A failed termination is retried by the next call (Computer shutdown).
 */
export function ownProcessGroup(ownership: ProcessGroupOwnership): () => Promise<void> {
    let terminating: Promise<void> | null = null;
    const terminate = () => {
        terminating ??= terminateProcessGroup(ownership).catch((error: unknown) => {
            terminating = null;
            throw error;
        });
        return terminating;
    };
    ownership.processes?.add(terminate);
    void ownership.exited.then(() =>
        terminate().then(
            () => ownership.processes?.remove(terminate),
            // The registry keeps the group, so Computer shutdown retries and reports it.
            () => undefined
        )
    );
    return terminate;
}

async function terminateProcessGroup(ownership: ProcessGroupOwnership): Promise<void> {
    const { pid } = ownership;
    if (pid === undefined) {
        await ownership.exited;
        return;
    }
    const graceMs = ownership.graceMs ?? DEFAULT_GRACE_MS;
    for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
        signalGroup(pid, signal);
        if (await groupEndsWithin(pid, ownership.exited, graceMs)) {
            return;
        }
    }
    throw new Error(`${ownership.label} process group ${pid} did not terminate.`);
}

function signalGroup(pid: number, signal: NodeJS.Signals) {
    try {
        process.kill(process.platform === 'win32' ? pid : -pid, signal);
    } catch (error) {
        if (!isSystemErrorCode(error, 'ESRCH')) {
            throw error;
        }
    }
}

async function groupEndsWithin(
    pid: number,
    exited: Promise<unknown>,
    ms: number
): Promise<boolean> {
    const deadline = Date.now() + ms;
    if (!(await settlesWithin(exited, ms))) {
        return false;
    }
    // Windows has no process groups to outlive the leader.
    if (process.platform === 'win32') {
        return true;
    }
    while (isProcessGroupAlive(pid)) {
        if (Date.now() >= deadline) {
            return false;
        }
        await Bun.sleep(LIVENESS_POLL_MS);
    }
    return true;
}

async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
    });
    try {
        return await Promise.race([promise.then(() => true as const), timeout]);
    } finally {
        clearTimeout(timer);
    }
}
