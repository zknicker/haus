import { expect, test } from 'bun:test';
import type { AgentExecutionOutlineEntry } from '@haus/api';
import { QueryClient } from '@tanstack/react-query';
import {
    createReadGate,
    isSettledOutlineEntry,
    readTurnOutlines,
    turnOutlinesKey,
} from './turn-outlines.ts';

const serverId = 'srv_1';
const agentId = 'agt_1';

function available(runId: string, status: 'completed' | 'running' = 'completed') {
    return {
        outline: {
            durationMs: 1000,
            runId,
            startedAt: '2026-10-01T10:00:00.000Z',
            status,
            steps: [],
        },
        runId,
        status: 'available',
    } satisfies AgentExecutionOutlineEntry;
}

/** The Server as the batch sees it: one call per request, with scripted answers. */
function server(answer: (runId: string) => AgentExecutionOutlineEntry) {
    const calls: string[][] = [];
    return {
        calls,
        fetch: (runIds: string[]) => {
            calls.push(runIds);
            return Promise.resolve(runIds.map(answer));
        },
    };
}

/** Reads like the hook does: the result lands in the query cache under the Agent's key. */
async function read(
    client: QueryClient,
    runIds: string[],
    fetch: (runIds: string[]) => Promise<AgentExecutionOutlineEntry[]>,
    key: string
) {
    return await client.fetchQuery({
        queryFn: () => readTurnOutlines({ agentId, client, fetch, runIds, serverId }),
        queryKey: [...turnOutlinesKey(serverId, agentId), key],
    });
}

test('reads a whole day in one request and never asks again for settled runs', async () => {
    const client = new QueryClient();
    const remote = server((runId) => available(runId));
    const runIds = Array.from({ length: 12 }, (_, index) => `run_${index}`);

    const first = await read(client, runIds, remote.fetch, 'day-1');
    expect(remote.calls).toEqual([runIds]);
    expect(first.every(isSettledOutlineEntry)).toBe(true);

    // A later read that overlaps reuses every settled outline and asks only for the new run.
    await read(client, [...runIds, 'run_new'], remote.fetch, 'day-1-plus');
    expect(remote.calls).toEqual([runIds, ['run_new']]);

    // Revisiting asks for nothing at all.
    await read(client, runIds, remote.fetch, 'day-1-again');
    expect(remote.calls).toHaveLength(2);
});

test('splits a large day into sequential requests of at most 50 runs', async () => {
    const remote = server((runId) => available(runId));
    const runIds = Array.from({ length: 120 }, (_, index) => `run_${index}`);
    await read(new QueryClient(), runIds, remote.fetch, 'big');
    expect(remote.calls.map((call) => call.length)).toEqual([50, 50, 20]);
});

test('reads missing and still-running runs again; a settled outline is final', async () => {
    const client = new QueryClient();
    const answers: Record<string, AgentExecutionOutlineEntry> = {
        run_done: available('run_done', 'completed'),
        run_missing: { runId: 'run_missing', status: 'missing' },
        run_running: available('run_running', 'running'),
    };
    const remote = server((runId) => answers[runId] as AgentExecutionOutlineEntry);
    const runIds = Object.keys(answers);
    await read(client, runIds, remote.fetch, 'first');
    await read(client, runIds, remote.fetch, 'again');
    expect(remote.calls).toEqual([runIds, ['run_missing', 'run_running']]);
});

test('the read gate keeps at most its limit in flight and runs the rest in order', async () => {
    const gate = createReadGate(3);
    let inFlight = 0;
    let peak = 0;
    const order: number[] = [];
    const releases: Array<() => void> = [];
    const reads = Array.from({ length: 7 }, (_, index) =>
        gate(async () => {
            inFlight += 1;
            peak = Math.max(peak, inFlight);
            order.push(index);
            await new Promise<void>((resolve) => releases.push(resolve));
            inFlight -= 1;
            return index;
        })
    );
    while (order.length < 7) {
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        releases.shift()?.();
    }
    for (const release of releases) {
        release();
    }
    expect(await Promise.all(reads)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(3);
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6]);
});
