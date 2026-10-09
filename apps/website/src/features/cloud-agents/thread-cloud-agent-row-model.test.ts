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

test('every job gets its own row, problems first, then working, done, cancelled', () => {
    expect(
        titles([
            work({ id: 'a', status: 'cancelled', title: 'Cancelled' }),
            work({ id: 'b', status: 'completed', title: 'Done' }),
            work({ id: 'c', ...fresh, title: 'Working' }),
            work({ id: 'd', title: 'Quiet', updatedAt: minutesAgo(52) }),
            work({ id: 'e', status: 'failed', title: 'Failed' }),
            work({ id: 'f', ...fresh, title: 'Working too' }),
        ])
    ).toEqual(['Failed', 'Quiet', 'Working', 'Working too', 'Done', 'Cancelled']);
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
