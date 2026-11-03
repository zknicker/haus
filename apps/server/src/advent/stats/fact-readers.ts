import { sql } from 'drizzle-orm';
import type { AdventCountedFact, AdventFactStat, AdventRecapCounts } from '../fact-stats.ts';
import { type AdventScope, memberMessages } from '../year-scope.ts';
import { addressedCte, agentColumns, readHardestWorker, readTokensUsed } from './agent-stats.ts';
import {
    readFavoriteReaction,
    readFilesShared,
    readInDemand,
    readNewChannels,
    readTasksClosed,
} from './gesture-stats.ts';
import { type AdventReader, readRow } from './read-row.ts';
import { rhythmColumns } from './rhythm-stats.ts';
import { recapCountsColumn, roomColumns } from './room-stats.ts';

const messageColumns = { ...rhythmColumns, ...roomColumns, ...agentColumns };
type MessageFact = keyof typeof messageColumns;
type StandaloneFact = Exclude<AdventCountedFact, MessageFact>;

const standaloneReaders: {
    [F in StandaloneFact]: (db: AdventReader, scope: AdventScope) => Promise<AdventFactStat<F>>;
} = {
    'favorite-reaction': readFavoriteReaction,
    'files-shared': readFilesShared,
    'hardest-worker': readHardestWorker,
    'in-demand': readInDemand,
    'new-channels': readNewChannels,
    'tasks-closed': readTasksClosed,
    'tokens-used': readTokensUsed,
};

export interface AdventStats {
    /** The recap's room and Thread counts; null unless the recap was requested. */
    recapCounts: AdventRecapCounts | null;
    stat<F extends AdventCountedFact>(fact: F): AdventFactStat<F>;
}

/**
 * Reads exactly the requested facts. Every fact drawn from the member's
 * messages shares one query, so the readable-Chat probe runs once per
 * request; the rest are one query each. Reads stay sequential, never fanned
 * out across the pool.
 */
export async function readAdventStats(
    db: AdventReader,
    scope: AdventScope,
    facts: readonly AdventCountedFact[],
    options: { recap: boolean }
): Promise<AdventStats> {
    const wanted = [...new Set(facts)];
    const stats = new Map<AdventCountedFact, unknown>();
    const passFacts = wanted.filter(isMessageFact);
    let recapCounts: AdventRecapCounts | null = null;
    if (passFacts.length > 0 || options.recap) {
        const row = await readMessagePass(db, scope, passFacts, options.recap);
        for (const fact of passFacts) {
            stats.set(fact, row[fact] ?? null);
        }
        recapCounts = options.recap ? (row['recap-counts'] as AdventRecapCounts) : null;
    }
    for (const fact of wanted) {
        if (!isMessageFact(fact)) {
            stats.set(fact, await readStandalone(db, scope, fact));
        }
    }
    return {
        recapCounts,
        stat: <F extends AdventCountedFact>(fact: F) => {
            if (!stats.has(fact)) {
                throw new Error(`Advent fact ${fact} was not read for this request.`);
            }
            return (stats.get(fact) ?? null) as AdventFactStat<F>;
        },
    };
}

/** One query: the member's messages once, then one column per requested fact. */
async function readMessagePass(
    db: AdventReader,
    scope: AdventScope,
    facts: readonly MessageFact[],
    recap: boolean
): Promise<Record<string, unknown>> {
    const addressed = facts.some((fact) => fact in agentColumns);
    const columns = facts.map(
        (fact) => sql`${messageColumns[fact](scope)} as ${sql.identifier(fact)}`
    );
    if (recap) {
        columns.push(sql`${recapCountsColumn} as "recap-counts"`);
    }
    const row = await readRow<Record<string, unknown>>(
        db,
        sql`
            with mine as materialized (${memberMessages(scope, { content: addressed })})
            ${addressed ? sql`, ${addressedCte(scope)}` : sql``}
            select ${sql.join(columns, sql`, `)}
        `
    );
    if (!row) {
        throw new Error('The advent message pass returned no row.');
    }
    return row;
}

function readStandalone<F extends StandaloneFact>(
    db: AdventReader,
    scope: AdventScope,
    fact: F
): Promise<AdventFactStat<F>> {
    return standaloneReaders[fact](db, scope);
}

function isMessageFact(fact: AdventCountedFact): fact is MessageFact {
    return fact in messageColumns;
}
