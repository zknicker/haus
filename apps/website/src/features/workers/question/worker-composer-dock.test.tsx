import { afterEach, expect, test } from 'bun:test';
import type { WorkerQuestionsClosed, WorkerTurnInput } from '@haus/api';
import { setQuestionsLater } from '../../../hooks/workers/use-questions-later.ts';
import { WorkerView } from '../view/worker-view.tsx';
import { workerTurnFixture as turn, workerFixture as work } from '../worker-fixture.ts';
import { WorkerFollowUpComposer } from '../worker-follow-up-composer.tsx';
import { askReport, renderWorkerSurface } from '../worker.test-utils.tsx';

const task = { chatId: 'cht_task', id: 'tsk_one', key: 'GEN-1' };
const questions = [
    {
        header: 'Database',
        multiSelect: false,
        options: [
            { description: 'Matches the Server store', label: 'Postgres (Recommended)' },
            { description: null, label: 'SQLite' },
        ],
        question: 'Which database should the tasks table move to?',
    },
    { header: null, multiSelect: false, options: [], question: 'Anything else?' },
];

afterEach(() => setQuestionsLater('wkt_ask', false, null));

test('open questions take over the Worker composer with the first step', () => {
    const html = render();

    expect(html).toContain('data-slot="question-takeover"');
    expect(html).toContain('1 of 2');
    expect(html).toContain('Which database should the tasks table move to?');
    expect(html).toContain('>Postgres<');
    expect(html).not.toContain('>Postgres (Recommended)<');
    expect(html).toContain('Or type an answer');
    expect(html).toContain('Later');
    expect(html).toContain('Dismiss');
    expect(html).toContain('Next');
    expect(html).not.toContain('aria-label="Send follow-up"');
    expect(html).toContain('Asked 2 questions');
});

test('Later brings back the composer on this device, with a way back to the questions', () => {
    setQuestionsLater('wkt_ask', true, null);
    const html = render();

    expect(html).not.toContain('data-slot="question-takeover"');
    expect(html).toContain('Answer questions');
    expect(html).toContain('placeholder="Answer this Worker"');
});

test('dismissed questions leave a quiet attributed line above the composer', () => {
    const html = render({
        at: '2026-09-04T12:10:00.000Z',
        by: { id: 'usr_zach', kind: 'user' },
        reason: 'dismissed',
    });

    expect(html).not.toContain('data-slot="question-takeover"');
    expect(html).toContain('Dismissed by Zach');
    expect(html).not.toContain('Answer questions');
    expect(html).toContain('placeholder="Answer this Worker"');
});

test('a card answer reads as the person’s follow-up, its numbered list rendered as markdown', () => {
    const answer: WorkerTurnInput = {
        at: '2026-09-04T12:05:00.000Z',
        author: { id: 'usr_zach', kind: 'user' },
        kind: 'follow-up',
        messageId: null,
        text: '1. **Which database should the tasks table move to?** → Postgres\n2. **Anything else?** → (no answer)',
    };
    const worker = work({
        turns: [
            turn({ input: [answer], status: 'running', turnId: 'wkt_two' }),
            askingTurn(undefined),
        ],
        updatedAt: new Date().toISOString(),
    });
    const html = renderWorkerSurface(<WorkerView workerId={worker.id} />, { task, worker });

    expect(html).not.toContain('data-slot="question-takeover"');
    expect(html).toContain('<strong>Which database should the tasks table move to?</strong>');
    expect(html).toContain('(no answer)');
});

test('a refused answer’s text seeds the follow-up composer as its draft', () => {
    const draft = '1. **Anything else?** → Keep it reversible';
    const html = renderWorkerSurface(
        <WorkerFollowUpComposer initialText={draft} serverId="srv_cards" work={work()} />
    );

    expect(html).toContain('Keep it reversible');
    expect(html).toContain('aria-label="Send follow-up"');
});

function render(closed?: WorkerQuestionsClosed) {
    const worker = work({ turns: [askingTurn(closed)] });
    return renderWorkerSurface(<WorkerView workerId={worker.id} />, { task, worker });
}

function askingTurn(closed: WorkerQuestionsClosed | undefined) {
    return turn({
        outcome: {
            kind: 'report',
            report: {
                ...askReport,
                questions,
                ...(closed ? { questionsClosed: closed } : {}),
                text: 'Which database should the tasks table move to?',
            },
        },
        status: 'pending_input',
        turnId: 'wkt_ask',
    });
}
