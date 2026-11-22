import { expect, test } from 'bun:test';
import type { QuestionRequest } from './ask-model.ts';
import {
    type AskTakeoverAction,
    type AskTakeoverState,
    askTakeoverStart,
    askTakeoverView,
    stepAskTakeover,
} from './ask-takeover-state.ts';

const request = {
    questions: [
        {
            header: 'Database',
            multiSelect: false,
            options: [
                { description: 'Matches the Server store', label: 'Postgres (Recommended)' },
                { description: null, label: 'SQLite' },
            ],
            question: 'Which database?',
        },
        {
            header: null,
            multiSelect: true,
            options: [
                { description: null, label: '#product' },
                { description: null, label: 'Priya' },
            ],
            question: 'Who should hear?',
        },
        { header: null, multiSelect: false, options: [], question: 'Anything else?' },
    ],
} satisfies QuestionRequest;

test('a single-select pick answers its step and moves on', () => {
    const { state, submit } = stepAskTakeover(askTakeoverStart(request), {
        kind: 'pick',
        labels: ['SQLite'],
    });

    expect(submit).toBe(false);
    expect(state.step).toBe(1);
    expect(state.answers[0]).toEqual({ labels: ['SQLite'], text: '' });
});

test('number keys pick a single-select option, then toggle multi-select ones in place', () => {
    const state = run(askTakeoverStart(request), [
        { index: 0, kind: 'key' },
        { index: 1, kind: 'key' },
        { index: 0, kind: 'key' },
        { index: 1, kind: 'key' },
        { index: 7, kind: 'key' },
    ]);

    expect(state.step).toBe(1);
    expect(state.answers[0]?.labels).toEqual(['Postgres (Recommended)']);
    expect(state.answers[1]?.labels).toEqual(['#product']);
});

test('a question with no options takes a typed answer, and Enter moves on only once answered', () => {
    const atThird = run(askTakeoverStart(request), [{ kind: 'next' }, { kind: 'next' }]);
    expect(askTakeoverView(atThird).question?.question).toBe('Anything else?');
    expect(stepAskTakeover(atThird, { kind: 'enter' }).state.step).toBe(2);

    const typed = run(atThird, [{ kind: 'type', text: 'Keep it reversible' }, { kind: 'enter' }]);
    expect(typed.answers[2]?.text).toBe('Keep it reversible');
    expect(askTakeoverView(typed).reviewing).toBe(true);
});

test('Review sends only from the last step, once something is answered', () => {
    const skipped = run(askTakeoverStart(request), [
        { kind: 'next' },
        { kind: 'next' },
        { kind: 'next' },
    ]);
    expect(askTakeoverView(skipped)).toMatchObject({ canSend: false, reviewing: true });
    expect(stepAskTakeover(skipped, { kind: 'send' }).submit).toBe(false);

    const answered = run(skipped, [
        { kind: 'edit', step: 0 },
        { index: 0, kind: 'key' },
    ]);
    expect(answered.step).toBe(1);
    expect(stepAskTakeover(answered, { kind: 'send' }).submit).toBe(false);

    const reviewing = run(answered, [{ kind: 'next' }, { kind: 'next' }]);
    const sent = stepAskTakeover(reviewing, { kind: 'send' });
    expect(sent.submit).toBe(true);
    expect(sent.state.answers.map((answer) => answer.labels)).toEqual([
        ['Postgres (Recommended)'],
        [],
        [],
    ]);
});

test('Back stops at the first step and Edit lands on a real step', () => {
    const state = askTakeoverStart(request);

    expect(stepAskTakeover(state, { kind: 'back' }).state.step).toBe(0);
    expect(stepAskTakeover(state, { kind: 'edit', step: 9 }).state.step).toBe(2);
});

test('one single-select question sends on its pick; one typed question sends on Enter', () => {
    const [first, , third] = request.questions;
    const picked = stepAskTakeover(askTakeoverStart({ questions: [first] }), {
        index: 1,
        kind: 'key',
    });
    expect(picked.submit).toBe(true);
    expect(picked.state.answers).toEqual([{ labels: ['SQLite'], text: '' }]);

    const typed = run(askTakeoverStart({ questions: [third] }), [{ kind: 'type', text: 'No' }]);
    expect(askTakeoverView(typed).sends).toBe(true);
    expect(stepAskTakeover(typed, { kind: 'enter' }).submit).toBe(true);
});

function run(state: AskTakeoverState, actions: readonly AskTakeoverAction[]) {
    return actions.reduce((current, action) => stepAskTakeover(current, action).state, state);
}
