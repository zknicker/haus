import type { AdventEntry } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';

/** The advent calendar read: `pending` until the first answer, then its entries or `error`. */
export type AdventCalendarRead =
    | { readonly status: 'pending' }
    | { readonly status: 'error' }
    | { readonly entries: readonly AdventEntry[]; readonly status: 'success' };

/**
 * How long one answer stays fresh, and cached once the dialog closes. No
 * event covers this read, and it counts a whole year of facts, so it must not
 * ride the 30s synced-snapshot floor: every reopen and focus would recount.
 * The answer moves at most once a day, and the day (`throughDay`) is in the
 * key, so a new day is a new read; within a day, half a day is never stale
 * enough to matter. Finite, because the staleness contract keeps every
 * changing Server read able to go stale (query-policy-contract.test.ts).
 * Reconnect never refetches (the client default), and focus refetches only
 * stale reads, so neither recounts it.
 */
const adventCalendarFreshMs = 12 * 60 * 60_000;

/**
 * "Your year in Haus": the member's doors from Dec 1 through `throughDay`
 * (25 opens every door), counted in this device's time zone.
 */
export function useAdventCalendar(
    serverId: string,
    year: number,
    throughDay: number
): AdventCalendarRead {
    const query = hausTrpc.advent.calendar.useQuery(
        { serverId, throughDay, timeZone: localTimeZone(), year },
        { gcTime: adventCalendarFreshMs, staleTime: adventCalendarFreshMs }
    );
    if (query.data) {
        return { entries: query.data.entries, status: 'success' };
    }
    return query.isError ? { status: 'error' } : { status: 'pending' };
}

function localTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
