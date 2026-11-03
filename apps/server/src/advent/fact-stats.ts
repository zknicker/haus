import type { AdventFact } from '@haus/api';

/** A fact's door: every fact but the Dec 24 recap. */
export type AdventCountedFact = Exclude<AdventFact, 'recap'>;

interface Count {
    count: number;
}

interface NamedCount {
    count: number;
    /** A display name or `#channel`; never message content. */
    name: string;
}

/**
 * What the Server counted for each door. A reader returns `null` for an empty
 * fact (a zero count or no candidate), and the copy falls back to its empty
 * line rather than inventing a value.
 */
export interface AdventFactStats {
    'agents-at-table': Count;
    'busiest-day': {
        count: number;
        /** Local `YYYY-MM-DD`. */
        date: string;
    };
    'busiest-hour': {
        count: number;
        /** Local hour, 0–23. */
        hour: number;
    };
    'closest-dm': NamedCount;
    'early-bird': {
        /** Minutes after local midnight. */
        minuteOfDay: number;
        mornings: number;
    };
    'favorite-reaction': { count: number; emoji: string };
    'files-shared': Count;
    'full-house': NamedCount;
    'hardest-worker': { name: string; turns: number };
    'in-demand': Count;
    'longest-streak': {
        /** Consecutive local days with at least one message. */
        days: number;
        /** Local `YYYY-MM-DD` the run ended on. */
        endedOn: string;
    };
    'longest-thread': {
        replies: number;
        /** `#channel`, or null for a Thread in a DM. */
        room: string | null;
    };
    'loudest-channel': NamedCount;
    'messages-sent': Count;
    'most-thanked-agent': NamedCount;
    'new-channels': { count: number; latest: string };
    'night-owl': Count;
    'quickest-reply': { name: string; seconds: number };
    'quiet-month': {
        count: number;
        /** 1–12. */
        month: number;
    };
    'tasks-closed': Count;
    'threads-resolved': Count;
    'tokens-used': { tokens: number };
    'weekends-off': { percent: number; total: number; weekend: number };
}

export type AdventFactStat<F extends AdventCountedFact> = AdventFactStats[F] | null;

/** The two recap counts no single door carries. */
export interface AdventRecapCounts {
    chats: number;
    threads: number;
}
