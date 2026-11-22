import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type WorkerQuestions, workerAnswersText } from '@haus/api';
import { installFakeDom } from '../../../test-support/fake-dom.ts';
import { mountCallHook, type RecordedCall } from '../../../test-support/trpc-call-harness.tsx';
import { useWorkerQuestionReply } from './use-worker-question-reply.ts';

let restoreDom: () => void;
beforeAll(() => {
    restoreDom = installFakeDom();
});
afterAll(() => restoreDom());

const questions: WorkerQuestions = [
    {
        header: 'Database',
        multiSelect: false,
        options: [{ description: null, label: 'Postgres' }],
        question: 'Which database?',
    },
    {
        header: 'Notify',
        multiSelect: true,
        options: [
            { description: null, label: '#product' },
            { description: null, label: 'Priya' },
        ],
        question: 'Who should hear?',
    },
    { header: null, multiSelect: false, options: [], question: 'Anything else?' },
];
const asking = { questions, turnId: 'wkt_ask' };
const answers = [
    { labels: ['Postgres'], text: '  ' },
    { labels: ['#product', 'Priya'], text: 'and Maya' },
    { labels: [], text: '' },
];
const answersText = workerAnswersText(questions, [
    { labels: ['Postgres'], text: null },
    { labels: ['#product', 'Priya'], text: 'and Maya' },
    null,
]);
const answered = () => ({ turnId: 'wkt_next' });

test('Send posts the numbered answer list as a follow-up that answers the asking turn', async () => {
    const { harness, hook, mounted } = await mountReply(answered);

    await harness.act(async () => hook().sendAnswers(asking, answers));

    expect(harness.calls).toEqual([
        {
            input: {
                answersTurnId: 'wkt_ask',
                nonce: expect.any(String),
                serverId: 'srv_one',
                text: answersText,
                workerId: 'wkr_one',
            },
            path: 'worker.sendFollowUp',
            type: 'mutation',
        },
    ]);
    expect(hook().answeredTurnId).toBe('wkt_ask');
    expect(hook().refusal).toBeNull();
    await mounted.unmount();
});

test('a refused answer keeps its text and says who got there first', async () => {
    const { harness, hook, mounted } = await mountReply(() => {
        throw conflict('Answered by @zach.');
    });

    await harness.act(async () => hook().sendAnswers(asking, answers));

    expect(hook().answeredTurnId).toBeNull();
    expect(hook().refusal).toEqual({
        message: 'Answered by @zach.',
        text: answersText,
        turnId: 'wkt_ask',
    });
    await harness.act(() => hook().clearRefusal());
    expect(hook().refusal).toBeNull();
    await mounted.unmount();
});

test('Dismiss closes the asking turn’s questions on the Server', async () => {
    const { harness, hook, mounted } = await mountReply(() => null);

    await harness.act(async () => hook().dismissQuestions('wkt_ask'));

    expect(harness.calls).toEqual([
        {
            input: { serverId: 'srv_one', turnId: 'wkt_ask', workerId: 'wkr_one' },
            path: 'worker.dismissQuestion',
            type: 'mutation',
        },
    ]);
    expect(hook().refusal).toBeNull();
    await mounted.unmount();
});

function mountReply(answer: (call: RecordedCall) => unknown) {
    return mountCallHook(
        () => useWorkerQuestionReply({ serverId: 'srv_one', workerId: 'wkr_one' }),
        answer
    );
}

function conflict(message: string) {
    return { error: { code: -32_009, data: { code: 'CONFLICT' }, message } };
}
