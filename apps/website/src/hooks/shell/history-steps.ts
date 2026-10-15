/** Which way Back and Forward can step from the current history entry. */
export interface HistorySteps {
    back: boolean;
    forward: boolean;
}

export const noHistorySteps: HistorySteps = { back: false, forward: false };

/**
 * Back and Forward walk the App's own history: the entry beside the current
 * one must be an App page (`/s/…`), on any surface. Sign-in, the Server
 * picker, and anything outside the App end it even though the browser could
 * still step there. `paths` are entry pathnames, null where unknown.
 */
export function appHistorySteps(paths: readonly (string | null)[], index: number): HistorySteps {
    return { back: isAppPath(paths[index - 1]), forward: isAppPath(paths[index + 1]) };
}

function isAppPath(path: string | null | undefined): boolean {
    return typeof path === 'string' && path.startsWith('/s/');
}

/** An entry's pathname from its full URL; null when it has none. */
export function pathFromUrl(url: string | null): string | null {
    if (!url) {
        return null;
    }
    try {
        return new URL(url).pathname;
    } catch {
        return null;
    }
}

// useSyncExternalStore snapshots must be stable, so the pair travels as a string.
export function historyStepsKey(steps: HistorySteps): string {
    return `${steps.back ? 1 : 0}${steps.forward ? 1 : 0}`;
}

export function historyStepsFromKey(key: string): HistorySteps {
    return { back: key[0] === '1', forward: key[1] === '1' };
}
