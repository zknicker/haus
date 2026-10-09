import { expect, test } from 'bun:test';
import type { CloudAgentBranch, CloudAgentWork } from '@haus/api';
import {
    cloudAgentRunFixture as run,
    cloudAgentWorkFixture as work,
} from './cloud-agent-work-fixture.ts';
import { threadCloudAgentRows } from './thread-cloud-agent-row-model.ts';

const now = Date.parse('2026-09-04T12:10:00.000Z');
const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const fresh = { updatedAt: minutesAgo(1) };

const pullRequestBranch: CloudAgentBranch = {
    branch: 'cursor/test',
    pullRequest: {
        additions: 10,
        changedFiles: 23,
        deletions: 0,
        number: 59,
        observedAt: minutesAgo(5),
        state: 'open',
    },
    pullRequestUrl: 'https://github.com/haus/haus/pull/59',
    repository: 'haus/haus',
};

function titles(works: CloudAgentWork[]) {
    return threadCloudAgentRows(works, now).map((row) => row.work.title);
}

test('every job gets its own row in the order the jobs were started, whatever their state', () => {
    expect(
        titles([
            work({ createdAt: minutesAgo(10), id: 'a', status: 'cancelled', title: 'Third' }),
            work({ createdAt: minutesAgo(30), id: 'b', status: 'completed', title: 'First' }),
            work({ createdAt: minutesAgo(5), id: 'c', ...fresh, title: 'Fifth' }),
            work({
                createdAt: minutesAgo(20),
                id: 'd',
                title: 'Second',
                updatedAt: minutesAgo(52),
            }),
            work({ createdAt: minutesAgo(8), id: 'e', status: 'failed', title: 'Fourth' }),
        ])
    ).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth']);
});

test('jobs started at the same moment keep the Server order', () => {
    expect(
        titles([
            work({ id: 'a', status: 'completed', title: 'Listed first' }),
            work({ id: 'b', status: 'failed', title: 'Listed second' }),
        ])
    ).toEqual(['Listed first', 'Listed second']);
});

test('a row never moves when its job changes state', () => {
    const started = (title: string, minutes: number) => ({
        createdAt: minutesAgo(minutes),
        id: title,
        title,
    });
    const before = titles([
        work({ ...started('Older', 20), ...fresh }),
        work({ ...started('Newer', 10), ...fresh }),
    ]);
    const after = titles([
        work({ ...started('Older', 20), status: 'completed' }),
        work({ ...started('Newer', 10), status: 'failed' }),
    ]);

    expect(before).toEqual(['Older', 'Newer']);
    expect(after).toEqual(before);
});

test('a row states the job in the card vocabulary, never queued', () => {
    const [queued, followedUp] = threadCloudAgentRows(
        [
            work({ id: 'a', startedAt: minutesAgo(4), ...fresh }),
            work({
                id: 'b',
                runs: [run({ runId: 'car_two', status: 'queued' }), run({ status: 'completed' })],
                status: 'queued',
                ...fresh,
            }),
        ],
        now
    );

    expect(queued?.statusText).toBe('Working · 4m');
    expect(followedUp).toMatchObject({ state: 'done', statusText: 'Done' });
});

test('a quiet live job warns instead of stating its state', () => {
    const [row] = threadCloudAgentRows([work({ updatedAt: minutesAgo(52) })], now);

    expect(row).toMatchObject({ statusText: 'No update in 52m', tone: 'warning' });
});

test('a job keeps its title and gains a pull request marker, never the diff', () => {
    const [row] = threadCloudAgentRows(
        [work({ runs: [run({ branches: [pullRequestBranch] })], status: 'completed' })],
        now
    );

    expect(row?.work.title).toBe('Fix the failing migration');
    expect(row?.pullRequestNumber).toBe(59);
});
