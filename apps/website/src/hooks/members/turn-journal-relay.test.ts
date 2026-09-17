import { expect, test } from 'bun:test';
import type { AgentExecutionJournalResult } from '@haus/api';
import { createTurnJournalRelay, type TurnJournalSnapshot } from './turn-journal-relay.ts';

const available: AgentExecutionJournalResult = {
    type: 'agent-execution-journal-result',
    status: 'available',
    agentId: 'agent_one',
    requestId: 'request_one',
    runId: 'run_one',
    journal: {
        runId: 'run_one',
        startedAt: '2026-09-15T15:00:00.000Z',
        status: 'running',
        tools: [],
    },
};

function deferred() {
    let resolve: (value: AgentExecutionJournalResult) => void = () => {
        throw new Error('Not initialized');
    };
    const promise = new Promise<AgentExecutionJournalResult>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

test('refresh retains the visible journal and coalesces overlapping events into a final read', async () => {
    const snapshots: TurnJournalSnapshot[] = [];
    const next = deferred();
    let reads = 0;
    const relay = createTurnJournalRelay({
        runId: 'run_one',
        publish: (snapshot) => snapshots.push(snapshot),
        read: () => (++reads === 2 ? next.promise : Promise.resolve(available)),
    });
    await relay.refresh();
    const refresh = relay.refresh();
    for (let i = 0; i < 20; i++) {
        await relay.refresh();
    }
    expect(reads).toBe(2);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.presentation?.kind).toBe('available');
    next.resolve(available);
    await refresh;
    expect(reads).toBe(3);
    expect(
        snapshots.every(
            (snapshot) => !snapshot.isPending && snapshot.presentation?.kind === 'available'
        )
    ).toBe(true);
});

test('temporary relay failures preserve evidence and clear their notice on recovery', async () => {
    const snapshots: TurnJournalSnapshot[] = [];
    let fail = false;
    const relay = createTurnJournalRelay({
        runId: 'run_one',
        publish: (snapshot) => snapshots.push(snapshot),
        read: () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve(available)),
    });
    await relay.refresh();
    fail = true;
    await relay.refresh();
    expect(snapshots.at(-1)?.presentation?.kind).toBe('available');
    expect(snapshots.at(-1)?.refreshError).toContain('last received');
    fail = false;
    await relay.refresh();
    expect(snapshots.at(-1)?.refreshError).toBeNull();
});

test('closing or switching turns discards an in-flight response and queued work', async () => {
    const next = deferred();
    const snapshots: TurnJournalSnapshot[] = [];
    let reads = 0;
    const relay = createTurnJournalRelay({
        runId: 'run_one',
        publish: (snapshot) => snapshots.push(snapshot),
        read: () => {
            reads++;
            return next.promise;
        },
    });
    const refresh = relay.refresh();
    await relay.refresh();
    relay.dispose();
    next.resolve(available);
    await refresh;
    await relay.refresh();
    expect(snapshots).toEqual([]);
    expect(reads).toBe(1);
});
