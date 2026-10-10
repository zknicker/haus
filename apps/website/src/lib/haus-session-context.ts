import * as React from 'react';

/**
 * Re-authenticates the open socket after a stream was refused as
 * `UNAUTHORIZED`: reads the current Clerk token and hands it to the socket in
 * place (`session.refresh`), reconnecting only if the Server refuses it.
 * Resolves false when Clerk has no session (signed out), which is final.
 * Concurrent callers share one refresh.
 */
export type HausSessionRefresh = () => Promise<boolean>;

export const HausSessionRefreshContext = React.createContext<HausSessionRefresh>(async () => true);

export function useHausSessionRefresh(): HausSessionRefresh {
    return React.use(HausSessionRefreshContext);
}

/** One refresh in flight at a time; callers during it share its answer. */
export function singleFlightSessionRefresh(refresh: HausSessionRefresh): HausSessionRefresh {
    let inFlight: Promise<boolean> | null = null;
    return () => {
        inFlight ??= refresh().finally(() => {
            inFlight = null;
        });
        return inFlight;
    };
}
