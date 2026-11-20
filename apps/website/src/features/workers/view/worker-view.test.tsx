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

test('the Worker page is a session log: the brief first, the report once, and the docked composer', () => {
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
    expect(html).toContain('Needs you · worked for');
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
        'Failed · Ended without a report'
    );
});

test('step summaries render as one monospace line per kind, and the log works without them', () => {
    const steps = [
        {
            additions: null,
            deletions: null,
            kind: 'read' as const,
            label: 'src/PromptInput.tsx',
            ok: null,
        },
        {
            additions: 6,
            deletions: 4,
            kind: 'edit' as const,
            label: 'styles/default-theme.css',
            ok: null,
        },
    ];
    const worker = work({ turns: [turn({ input: [brief], status: 'completed', steps })] });
    const html = renderWorkerSurface(<WorkerView workerId={worker.id} />, { task, worker });

    expect(html).toContain('› Read PromptInput.tsx');
    expect(html).toContain('› Edited default-theme.css');
    expect(html).toContain('+6');
    expect(html.match(/data-testid="worker-step-line"/gu)).toHaveLength(2);
});
