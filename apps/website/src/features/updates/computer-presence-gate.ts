/** Whether this App session has verified which Computers answer right now. */
export type ComputerPresenceCheck = 'failed' | 'pending' | 'verified';

/**
 * Reads the presence probe query. Only the first-ever settle gates: once a
 * probe has verified, a later refocus probe that is in flight or fails keeps
 * the last verified Computers so a running update never loses its steps.
 */
export function readComputerPresenceCheck(query: {
    hasVerified: boolean;
    status: 'error' | 'pending' | 'success';
}): ComputerPresenceCheck {
    if (query.hasVerified) {
        return 'verified';
    }
    if (query.status === 'pending') {
        return 'pending';
    }
    return query.status === 'error' ? 'failed' : 'verified';
}

/**
 * The Computers the updater may act on. `null` holds the whole updater hidden
 * until this session's first presence check settles; a failed check offers no
 * Computer work but leaves App and website updates visible.
 */
export function gateComputersByPresence<T>(
    check: ComputerPresenceCheck,
    computers: readonly T[]
): readonly T[] | null {
    if (check === 'pending') {
        return null;
    }
    return check === 'verified' ? computers : [];
}
