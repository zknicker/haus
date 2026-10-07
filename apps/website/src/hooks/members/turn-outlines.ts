import {
    type AgentExecutionOutline,
    type AgentExecutionOutlineEntry,
    EXECUTION_OUTLINES_MAX_RUNS,
} from '@haus/api';
import type { QueryClient } from '@tanstack/react-query';

/**
 * App-local keys, not tRPC keys: outlines stay out of the new-window cache
 * handoff (`query-cache-handoff.ts`), and a new window reads its own in one request.
 */
export function turnOutlinesKey(serverId: string, agentId: string) {
    return ['haus-turn-outlines', serverId, agentId] as const;
}

/**
 * A settled turn's outline never changes, and a run with no journal will not
 * grow one; an offline, timed-out, or still-running answer is read again.
 */
export function isSettledOutlineEntry(entry: AgentExecutionOutlineEntry): boolean {
    return entry.status === 'available'
        ? entry.outline.status !== 'running'
        : entry.reason === 'missing';
}

/**
 * Every requested run's outline entry, reusing any settled entry an earlier
 * read of this Agent already holds and asking the Computer only for the rest,
 * at most {@link EXECUTION_OUTLINES_MAX_RUNS} runs per request, one request at a time.
 */
export async function readTurnOutlines({
    agentId,
    client,
    fetch,
    runIds,
    serverId,
}: {
    agentId: string;
    client: QueryClient;
    fetch: (runIds: string[]) => Promise<readonly AgentExecutionOutlineEntry[]>;
    runIds: readonly string[];
    serverId: string;
}): Promise<AgentExecutionOutlineEntry[]> {
    const known = readSettledEntries(client, serverId, agentId);
    const pending = runIds.filter((runId) => !known.has(runId));
    const fetched = new Map<string, AgentExecutionOutlineEntry>();
    for (let index = 0; index < pending.length; index += EXECUTION_OUTLINES_MAX_RUNS) {
        for (const entry of await fetch(
            pending.slice(index, index + EXECUTION_OUTLINES_MAX_RUNS)
        )) {
            fetched.set(entry.runId, entry);
        }
    }
    return runIds.map(
        (runId) =>
            known.get(runId) ??
            fetched.get(runId) ?? { reason: 'missing', runId, status: 'unavailable' }
    );
}

/** Available outlines by run, for the readers that draw them. */
export function indexOutlines(
    entries: readonly AgentExecutionOutlineEntry[] | undefined
): ReadonlyMap<string, AgentExecutionOutline> {
    const outlines = new Map<string, AgentExecutionOutline>();
    for (const entry of entries ?? []) {
        if (entry.status === 'available') {
            outlines.set(entry.runId, entry.outline);
        }
    }
    return outlines;
}

function readSettledEntries(
    client: QueryClient,
    serverId: string,
    agentId: string
): Map<string, AgentExecutionOutlineEntry> {
    const settled = new Map<string, AgentExecutionOutlineEntry>();
    for (const [, entries] of client.getQueriesData<AgentExecutionOutlineEntry[]>({
        queryKey: turnOutlinesKey(serverId, agentId),
    })) {
        for (const entry of entries ?? []) {
            if (isSettledOutlineEntry(entry)) {
                settled.set(entry.runId, entry);
            }
        }
    }
    return settled;
}
