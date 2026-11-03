import type { RuntimeProcessRegistry } from '../process-registry.ts';

/** A process registry that resolves `emptied` once every registered stop was removed. */
export function trackingRegistry(): RuntimeProcessRegistry & {
    readonly emptied: Promise<void>;
    readonly size: number;
} {
    const registered = new Set<() => Promise<void>>();
    const emptied = Promise.withResolvers<void>();
    return {
        add: (close) => {
            registered.add(close);
        },
        assertOpen: () => undefined,
        emptied: emptied.promise,
        remove: (close) => {
            registered.delete(close);
            if (registered.size === 0) {
                emptied.resolve();
            }
        },
        get size() {
            return registered.size;
        },
    };
}

/** Whether a process with this pid can still be signalled. */
export function isRunning(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/** Test cleanup: ends a stray process if an assertion failed before the driver did. */
export function killQuietly(pid: number): void {
    if (isRunning(pid)) {
        process.kill(pid, 'SIGKILL');
    }
}
