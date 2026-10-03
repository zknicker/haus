interface Timers {
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
    setTimeout: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

/**
 * Pairs this window's browser workspace mounts with Electron's destructive
 * `reset`. An unmount defers its reset one task; a remount for the same Server
 * cancels it — React StrictMode's dev double mount — so the pages Electron
 * already holds survive the throwaway first mount. A mount for another Server
 * runs the pending reset first.
 */
export function createBrowserWorkspaceLifecycle(
    timers: Timers = {
        clearTimeout: (handle) => clearTimeout(handle),
        setTimeout: (run, ms) => setTimeout(run, ms),
    }
) {
    let pending: {
        reset: () => void;
        serverId: string;
        timer: ReturnType<typeof setTimeout>;
    } | null = null;
    return {
        mount(serverId: string, mount: () => void) {
            const previous = pending;
            pending = null;
            if (previous) {
                timers.clearTimeout(previous.timer);
                if (previous.serverId !== serverId) {
                    previous.reset();
                }
            }
            mount();
        },
        unmount(serverId: string, reset: () => void) {
            if (pending) {
                timers.clearTimeout(pending.timer);
                pending.reset();
            }
            const entry = {
                reset,
                serverId,
                timer: timers.setTimeout(() => {
                    if (pending === entry) {
                        pending = null;
                        reset();
                    }
                }, 0),
            };
            pending = entry;
        },
    };
}

/** One per window: the App renders one browser workspace at a time. */
export const browserWorkspaceLifecycle = createBrowserWorkspaceLifecycle();
