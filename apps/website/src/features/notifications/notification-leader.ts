/** The slice of the Web Locks API leadership needs. */
export interface LockManagerApi {
    request(
        name: string,
        options: { signal: AbortSignal },
        callback: () => Promise<void>
    ): Promise<unknown>;
}

export interface NotificationLeadership {
    isLeader(): boolean;
    release(): void;
}

/**
 * Elects one tab of this browser profile to raise Needs you notifications for
 * one Server, so several open tabs do not each notify for the same message.
 * The leader holds a Web Lock until it releases or closes; the next waiting tab
 * then takes over with the rows it has already seen. The lock is per profile,
 * so the Electron app and a browser each keep their own leader. Without Web
 * Locks every tab leads, as before.
 */
export function claimNotificationLeadership(
    name: string,
    locks: LockManagerApi | undefined
): NotificationLeadership {
    if (!locks) {
        return { isLeader: () => true, release: () => undefined };
    }
    let leader = false;
    let releaseHeld: (() => void) | undefined;
    const controller = new AbortController();
    locks
        .request(name, { signal: controller.signal }, () => {
            leader = true;
            return new Promise<void>((resolve) => {
                releaseHeld = resolve;
            });
        })
        .catch((error: unknown) => {
            // Releasing before the lock was granted aborts the queued request.
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
                throw error;
            }
        });
    return {
        isLeader: () => leader,
        release: () => {
            leader = false;
            controller.abort();
            releaseHeld?.();
        },
    };
}

/** The browser's Web Locks, when this runtime has them. */
export function platformLocks(): LockManagerApi | undefined {
    return typeof navigator === 'undefined' ? undefined : navigator.locks;
}
