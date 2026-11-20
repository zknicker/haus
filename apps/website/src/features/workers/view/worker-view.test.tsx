import { expect, test } from 'bun:test';
import type { WorkerTurnInput } from '@haus/api';
import { workerTurnFixture as turn, workerFixture as work } from '../worker-fixture.ts';
import { askReport, renderWorkerSurface } from '../worker.test-utils.tsx';
import { WorkerView } from './worker-view.tsx';

const task = { chatId: 'cht_task', id: 'tsk_one', key: 'GEN-1' };
const brief: WorkerTurnInput = {
    at: '2026-09-04T12:00:00.000Z',
    author: { id: 'agt_one', kind: 'agent' },
    kind: 'brief',
    messageId: null,
    text: 'Fix the composer baseline.',
};
const followUp: WorkerTurnInput = {
    at: '2026-09-04T12:05:00.000Z',
    author: { id: 'usr_zach', kind: 'user' },
    kind: 'follow-up',
    messageId: 'msg_follow_up',
    text: 'Match iPhone.',
};

test('the Worker reads as channel messages: the Agent brief, the Worker report once, and the composer', () => {
    const worker = work({
        turns: [
            turn({ input: [followUp], status: 'running', turnId: 'wkt_two' }),
            turn({
                input: [brief],
                outcome: { kind: 'report', report: askReport },
                status: 'pending_input',
                turnId: 'wkt_one',
            }),
        ],
        updatedAt: new Date().toISOString(),
    });
    const html = renderWorkerSurface(<WorkerView workerId={worker.id} />, { task, worker });

    expect(html.indexOf('Fix the composer baseline.')).toBeLessThan(html.indexOf('Match iPhone.'));
    expect(html).toContain('Forge');
    expect(html).toContain('Zach');
    expect(html.match(/Fixed five of six\./gu)).toHaveLength(1);
    expect(html).toContain('Needs you, worked for');
    expect(html).toContain('Worker on Cursor');
    expect(html).toContain('aria-label="Stop Worker"');
});

test('a Worker on a chatless legacy Task reads its summary and takes no follow-ups', () => {
    const worker = work({
        turns: [turn({ input: [brief], status: 'completed', summary: 'Opened PR #4.' })],
    });
    const html = renderWorkerSurface(<WorkerView workerId={worker.id} />, {
        task: { ...task, chatId: null },
        worker,
    });

    expect(html).toContain('Opened PR #4.');
    expect(html).not.toContain('prompt-input');
});

test('a turn that ended without a report says why', () => {
    const worker = work({
        turns: [
            turn({
                input: [brief],
                outcome: { detail: null, kind: 'failed', reason: 'no-report' },
                status: 'failed',
            }),
        ],
    });

    expect(renderWorkerSurface(<WorkerView workerId={worker.id} />, { task, worker })).toContain(
        'Failed: Ended without a report'
    );
});

test('a turn with steps groups them in a collapsed group that says how long it worked', () => {
    const steps = [
        {
            additions: null,
            deletions: null,
            kind: 'read' as const,
            label: 'src/PromptInput.tsx',
            output: null,
            state: 'done' as const,
        },
        {
            additions: 6,
            deletions: 4,
            kind: 'edit' as const,
            label: 'styles/default-theme.css',
            output: null,
            state: 'done' as const,
        },
    ];
    const worker = work({
        turns: [
            turn({
                input: [brief],
                outcome: { kind: 'report', report: { ...askReport, outcome: 'done', ask: null } },
                startedAt: '2026-09-04T12:00:00.000Z',
                status: 'completed',
                steps,
                terminalAt: '2026-09-04T12:06:00.000Z',
            }),
        ],
    });
    const html = renderWorkerSurface(<WorkerView workerId={worker.id} />, { task, worker });

    expect(html).toContain('Worked for 6m · 2 steps');
    expect(html).toContain('>Finished<');
});

test('the Pull requests column is reserved only for a Worker with a pull request, and only in a wide pane', () => {
    const bare = work({ turns: [turn({ input: [brief], status: 'running' })] });
    const withPullRequest = work({
        pullRequest: {
            additions: 12,
            changedFiles: 2,
            checks: 'passing',
            deletions: 3,
            headSha: null,
            number: 352,
            observedAt: '2026-09-04T12:06:00.000Z',
            repository: 'zknicker/haus',
            review: 'none',
            settledAt: null,
            source: 'github',
            state: 'open',
            title: 'Match the iPhone composer inset',
            url: 'https://github.com/zknicker/haus/pull/352',
        },
        turns: [turn({ input: [brief], status: 'running' })],
    });
    const bareHtml = renderWorkerSurface(<WorkerView workerId={bare.id} />, { task, worker: bare });
    const html = renderWorkerSurface(<WorkerView workerId={withPullRequest.id} />, {
        task,
        worker: withPullRequest,
    });

    expect(bareHtml).not.toContain('grid-cols-[minmax(0,1fr)_18rem]');
    expect(bareHtml).not.toContain('Pull requests');
    expect(html).toContain('@container');
    expect(html).toContain('@4xl:grid-cols-[minmax(0,1fr)_18rem]');
    expect(html).toContain('Match the iPhone composer inset');
});
