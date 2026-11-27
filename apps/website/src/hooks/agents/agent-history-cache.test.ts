import { expect, test } from 'bun:test';
import type { AgentActivityEvent, AgentActivityHistoryPage } from '@haus/api';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { selectActivityPreview } from '../members/use-agent-activity-preview.ts';
import {
    insertActivityEvent,
    invalidateServerAgentHistory,
    invalidateSettledAgentHistory,
    patchAgentActivityHistory,
} from './agent-history-cache.ts';

const scope = { agentId: 'agt_ada', serverId: 'srv_one' };

test('a live event extends every cached newest page that covers it, in place', () => {
    const client = new QueryClient();
    const latest = key({ ...scope, limit: 50 });
    const preview = key({ ...scope, limit: 5 });
    const ownRun = key({ ...scope, limit: 100, runId: 'run_two' });
    const otherRun = key({ ...scope, limit: 100, runId: 'run_one' });
    const older = key({ ...scope, before: { position: 1, runId: 'run_one' }, limit: 50 });
    const otherAgent = key({ agentId: 'agt_wren', limit: 50, serverId: 'srv_one' });
    for (const queryKey of [latest, preview, ownRun, otherRun, older, otherAgent]) {
        client.setQueryData(queryKey, page([event('run_one', 1)]));
    }

    patchAgentActivityHistory(client, event('run_two', 1));

    const ids = (queryKey: readonly unknown[]) =>
        client.getQueryData<AgentActivityHistoryPage>(queryKey)?.events.map((row) => row.id);
    expect(ids(latest)).toEqual(['run_two:1', 'run_one:1']);
    expect(ids(preview)).toEqual(['run_two:1', 'run_one:1']);
    expect(ids(ownRun)).toEqual(['run_two:1', 'run_one:1']);
    // Another run's page, an older page, and another Agent's page never change.
    expect(ids(otherRun)).toEqual(['run_one:1']);
    expect(ids(older)).toEqual(['run_one:1']);
    expect(ids(otherAgent)).toEqual(['run_one:1']);
});

test('a known run patches without a read; a new run reads once for its trigger title', () => {
    const client = new QueryClient();
    const latest = key({ ...scope, limit: 50 });
    client.setQueryData(latest, page([event('run_one', 1)]));

    patchAgentActivityHistory(client, event('run_one', 2));
    // Nothing refetches per event of a run the page already titles.
    expect(client.getQueryState(latest)?.isInvalidated).toBe(false);

    patchAgentActivityHistory(client, event('run_two', 1));
    // Only the Server quotes a trigger, so a run new to the page reads once.
    expect(client.getQueryState(latest)?.isInvalidated).toBe(true);
});

test('a page keeps Server order: newest run first, each run newest position first', () => {
    const start = page([event('run_two', 3), event('run_two', 1), event('run_one', 4)]);
    const inserted = insertActivityEvent(start, event('run_two', 2));
    expect(inserted.events.map((row) => row.id)).toEqual([
        'run_two:3',
        'run_two:2',
        'run_two:1',
        'run_one:4',
    ]);
    // A replayed event is already there.
    expect(insertActivityEvent(inserted, event('run_two', 2))).toBe(inserted);
});

test('a full newest page grows and keeps its cursor, so loaded older pages stay contiguous', () => {
    const client = new QueryClient();
    const cursor = { position: 1, runId: 'run_one' };
    const newest = key({ ...scope, limit: 2 });
    const older = key({ ...scope, before: cursor, limit: 2 });
    client.setQueryData(newest, page([event('run_one', 2), event('run_one', 1)], cursor));
    client.setQueryData(older, page([event('run_zero', 2), event('run_zero', 1)]));

    patchAgentActivityHistory(client, event('run_two', 1));
    patchAgentActivityHistory(client, event('run_two', 2));

    const loaded = [newest, older].flatMap(
        (queryKey) =>
            client.getQueryData<AgentActivityHistoryPage>(queryKey)?.events.map((row) => row.id) ??
            []
    );
    // Every row survives across both loaded pages; none falls between them.
    expect(loaded).toEqual([
        'run_two:2',
        'run_two:1',
        'run_one:2',
        'run_one:1',
        'run_zero:2',
        'run_zero:1',
    ]);
    expect(client.getQueryData<AgentActivityHistoryPage>(newest)?.nextBefore).toEqual(cursor);
});

test('a page whose read is in flight reads again once that read lands', async () => {
    const client = new QueryClient();
    const latest = key({ ...scope, limit: 50 });
    let reads = 0;
    const releases: Array<() => void> = [];
    const observer = new QueryObserver(client, {
        queryFn: () => {
            reads += 1;
            return new Promise<AgentActivityHistoryPage>((resolve) => {
                releases.push(() => resolve(page([])));
            });
        },
        queryKey: latest,
        staleTime: 30_000,
    });
    const unsubscribe = observer.subscribe(() => {});
    // The first read is still in flight: the page has no data yet.
    expect(client.getQueryState(latest)?.fetchStatus).toBe('fetching');

    patchAgentActivityHistory(client, event('run_two', 1));
    patchAgentActivityHistory(client, event('run_two', 2));
    releases[0]?.();
    await settle();

    // The in-flight read finished, then exactly one follow-up read covers both events.
    expect(reads).toBe(2);
    releases[1]?.();
    await settle();
    unsubscribe();
});

test('an unobserved prefetch in flight leaves the page stale for its next mount', async () => {
    const client = new QueryClient();
    const latest = key({ ...scope, limit: 50 });
    let release = () => {};
    void client.prefetchQuery({
        queryFn: () =>
            new Promise<AgentActivityHistoryPage>((resolve) => {
                release = () => resolve(page([]));
            }),
        queryKey: latest,
    });

    patchAgentActivityHistory(client, event('run_two', 1));
    release();
    await settle();

    expect(client.getQueryState(latest)?.isInvalidated).toBe(true);
});

test("a stream start refreshes only that Server's mounted history, turn, and usage reads", async () => {
    const client = new QueryClient();
    const otherServer = { agentId: 'agt_ada', serverId: 'srv_two' };
    const reads = new Map<string, number>();
    const mount = (name: string, queryKey: readonly unknown[]) => {
        client.setQueryData(queryKey, {});
        const observer = new QueryObserver(client, {
            queryFn: () => {
                reads.set(name, (reads.get(name) ?? 0) + 1);
                return {};
            },
            queryKey,
            // Hydrated from a window handoff: fresh, so mounting alone never refetches.
            staleTime: 30_000,
        });
        return observer.subscribe(() => {});
    };
    const unsubscribes = [
        mount('history', key({ ...scope, limit: 50 })),
        mount('turns', getQueryKey(hausTrpc.agent.turns, { ...scope, limit: 50 }, 'query')),
        mount(
            'serverTurns',
            getQueryKey(hausTrpc.agent.serverTurns, { limit: 30, serverId: 'srv_one' }, 'infinite')
        ),
        mount('usage', getQueryKey(hausTrpc.stats.agentUsage, scope, 'query')),
        mount('otherHistory', key({ ...otherServer, limit: 50 })),
    ];
    await settle();
    expect(reads.size).toBe(0);

    await invalidateServerAgentHistory(client, 'srv_one');

    expect(Object.fromEntries(reads)).toEqual({
        history: 1,
        serverTurns: 1,
        turns: 1,
        usage: 1,
    });
    for (const unsubscribe of unsubscribes) {
        unsubscribe();
    }
});

test('the hover preview trims a grown page to its own size at read time', () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((position) => event('run_one', 8 - position));
    expect(selectActivityPreview(page(rows)).events.map((row) => row.id)).toEqual([
        'run_one:7',
        'run_one:6',
        'run_one:5',
        'run_one:4',
        'run_one:3',
    ]);
    const short = page(rows.slice(0, 2));
    expect(selectActivityPreview(short)).toBe(short);
});

test('settlement invalidates the Agent turn reads once, never older activity pages', async () => {
    const client = new QueryClient();
    const turns = getQueryKey(hausTrpc.agent.turns, { ...scope, limit: 50 }, 'query');
    const runTurn = getQueryKey(
        hausTrpc.agent.turns,
        { ...scope, limit: 1, runId: 'run_two' },
        'query'
    );
    const otherTurns = getQueryKey(
        hausTrpc.agent.turns,
        { agentId: 'agt_wren', limit: 50, serverId: 'srv_one' },
        'query'
    );
    const latest = key({ ...scope, limit: 50 });
    const older = key({ ...scope, before: { position: 1, runId: 'run_one' }, limit: 50 });
    const serverTurns = getQueryKey(
        hausTrpc.agent.serverTurns,
        { limit: 30, serverId: 'srv_one' },
        'infinite'
    );
    const usage = getQueryKey(hausTrpc.stats.agentUsage, scope, 'query');
    for (const queryKey of [turns, runTurn, otherTurns, latest, older, serverTurns, usage]) {
        client.setQueryData(queryKey, {});
    }
    const stale = (queryKey: readonly unknown[]) => client.getQueryState(queryKey)?.isInvalidated;

    await invalidateSettledAgentHistory(client, { ...scope, phase: 'working' });
    expect(stale(turns)).toBe(false);

    await invalidateSettledAgentHistory(client, { ...scope, phase: 'settled' });
    expect([turns, runTurn, latest, serverTurns, usage].map(stale)).toEqual([
        true,
        true,
        true,
        true,
        true,
    ]);
    expect(stale(otherTurns)).toBe(false);
    expect(stale(older)).toBe(false);
});

function settle() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function key(input: Record<string, unknown>) {
    return getQueryKey(hausTrpc.agent.activityHistory, input as never, 'query');
}

function page(
    events: AgentActivityEvent[],
    nextBefore: AgentActivityHistoryPage['nextBefore'] = null
): AgentActivityHistoryPage {
    const runIds = [...new Set(events.map((row) => row.runId))];
    return { events, nextBefore, runTriggers: runIds.map((runId) => ({ runId, trigger: null })) };
}

function event(runId: string, position: number): AgentActivityEvent {
    return {
        agentId: scope.agentId,
        category: 'using_tool',
        id: `${runId}:${position}`,
        occurredAt: '2026-10-08T12:00:00.000Z',
        phase: 'started',
        position,
        producer: 'computer',
        producerId: 'cmp_one',
        producerSequence: position,
        runId,
        serverId: scope.serverId,
    };
}
