import { describe, expect, test } from 'bun:test';
import type { WorkerQuestions } from '@haus/api';
import type { RuntimeSession } from '../driver.ts';
import type { TurnEvent } from '../turn-event.ts';
import { codexQuestionMethod } from './question-request.ts';
import { FakeAppServer } from './testing/fake-app-server.ts';
import { replayDriver, testCodexDriver } from './testing/replay-driver.ts';
import { flush, labels, turnCompleted, turnStarted, usage } from './testing/session-harness.ts';

const colorQuestion = {
    header: 'Color',
    id: 'color',
    isOther: true,
    isSecret: false,
    options: [{ description: 'Calm default', label: 'Blue' }],
    question: 'Which color should the button be?',
};

async function drain(session: RuntimeSession, prompt: string) {
    const turn = await session.startTurn({ prompt, signal: new AbortController().signal });
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
    }
    await turn.settle();
    return events;
}

async function askingFake(onQuestion?: (questions: WorkerQuestions) => Promise<void>) {
    const fake = new FakeAppServer();
    const session = await testCodexDriver(() => fake).openSession({
        onQuestion,
        resumeFrom: undefined,
        sessionId: 'wrk_1',
    });
    const turn = await session.startTurn({ prompt: 'go', signal: new AbortController().signal });
    turnStarted(fake, fake.lastTurnId);
    const finished = (async () => {
        const events: TurnEvent[] = [];
        for await (const event of turn.events) {
            events.push(event);
        }
        return events;
    })();
    const ask = (id: number, questions: unknown[] = [colorQuestion]) =>
        fake.emit({
            id,
            method: codexQuestionMethod,
            params: {
                isBlocking: false,
                itemId: `call_${id}`,
                questions,
                threadId: fake.threadId,
                turnId: fake.lastTurnId,
            },
        });
    return { ask, fake, finished, session };
}

function replyTo(fake: FakeAppServer, id: number) {
    return fake.replies.find((reply) => reply.id === id) as
        | { error?: { code: number; message: string } }
        | undefined;
}

describe('Codex Worker questions', () => {
    test('a recorded question ends the turn cleanly and the answer resumes the thread', async () => {
        const { driver, transports } = replayDriver('question-turn');
        const asked: WorkerQuestions[] = [];
        const onQuestion = async (questions: WorkerQuestions) => {
            asked.push(questions);
        };
        const first = await driver.openSession({
            onQuestion,
            resumeFrom: undefined,
            sessionId: 'q',
        });
        const asking = await drain(first, 'ask about color');
        expect(labels(asking)).toEqual([
            'reasoning-start',
            'reasoning-delta:**Executing initial tool call upon user request**',
            'reasoning-end',
            'turn-finish',
        ]);
        expect(asked).toEqual([
            [
                {
                    header: 'Color',
                    multiSelect: false,
                    options: [
                        { description: 'Calm default', label: 'Blue' },
                        { description: 'High urgency', label: 'Red' },
                    ],
                    question: 'Which color should the button be?',
                },
            ],
        ]);
        const written = transports[0]?.written ?? [];
        const start = written.find((message) => message.method === 'thread/start') as {
            params: { config: Record<string, unknown> };
        };
        expect(start.params.config).toMatchObject({
            features: { default_mode_request_user_input: true },
            suppress_unstable_features_warning: true,
        });
        const interrupt = written.findIndex((message) => message.method === 'turn/interrupt');
        const reply = written.findIndex((message) => message.id === 0 && !message.method);
        expect(interrupt).toBeGreaterThan(-1);
        expect(reply).toBeGreaterThan(interrupt);
        expect((written[reply] as { error: { code: number } }).error.code).toBe(-32_000);

        const second = await driver.openSession({
            onQuestion,
            resumeFrom: await first.stop(),
            sessionId: 'q',
        });
        const answered = await drain(second, '1. **Which color should the button be?** → Blue');
        expect(labels(answered)).toContain('turn-finish');
        expect(asked[1]?.[0]?.question).toBe('Which size should the button be?');
        const resume = transports[1]?.written.find(
            (message) => message.method === 'thread/resume'
        ) as { params: { config: Record<string, unknown> } };
        expect(resume.params.config.features).toEqual({ default_mode_request_user_input: true });
        await second.stop();
    });

    test('without a question capture the tool stays off and Codex hears method-not-found', async () => {
        const { ask, fake, finished, session } = await askingFake();
        expect(fake.request('thread/start')?.params.config).not.toHaveProperty('features');
        ask(0);
        await flush();
        expect(replyTo(fake, 0)?.error?.code).toBe(-32_601);
        usage(fake, fake.lastTurnId);
        turnCompleted(fake, fake.lastTurnId);
        expect(labels(await finished)).toEqual(['step-finish', 'turn-finish']);
        await session.destroy();
    });

    test('a session that captures questions still denies every approval', async () => {
        const asked: WorkerQuestions[] = [];
        const { fake, finished, session } = await askingFake(async (questions) => {
            asked.push(questions);
        });
        fake.emit({ id: 7, method: 'item/commandExecution/requestApproval', params: {} });
        fake.emit({
            id: 8,
            method: 'item/permissions/requestApproval',
            params: { permissions: {} },
        });
        await flush();
        const result = (id: number) =>
            (fake.replies.find((reply) => reply.id === id) as { result?: unknown } | undefined)
                ?.result;
        expect(result(7)).toEqual({ decision: 'decline' });
        expect(result(8)).toEqual({ permissions: {}, scope: 'turn' });
        expect(asked).toEqual([]);
        usage(fake, fake.lastTurnId);
        turnCompleted(fake, fake.lastTurnId);
        await finished;
        await session.destroy();
    });

    test('an invalid question is refused with a reason and the turn runs on', async () => {
        const asked: WorkerQuestions[] = [];
        const { ask, fake, finished, session } = await askingFake(async (questions) => {
            asked.push(questions);
        });
        ask(0, [{ ...colorQuestion, header: 'H'.repeat(61) }]);
        await flush();
        expect(replyTo(fake, 0)?.error?.code).toBe(-32_602);
        expect(replyTo(fake, 0)?.error?.message).toContain('request_user_input was not asked');
        expect(asked).toEqual([]);
        expect(fake.methods()).not.toContain('turn/interrupt');
        usage(fake, fake.lastTurnId);
        turnCompleted(fake, fake.lastTurnId);
        expect(labels(await finished)).toEqual(['step-finish', 'turn-finish']);
        await session.destroy();
    });

    test('a second question in the same turn is refused without a second capture', async () => {
        const asked: WorkerQuestions[] = [];
        const { ask, fake, finished, session } = await askingFake(async (questions) => {
            asked.push(questions);
        });
        ask(0);
        await flush();
        ask(1);
        await flush();
        expect(asked).toHaveLength(1);
        expect(fake.methods().filter((method) => method === 'turn/interrupt')).toHaveLength(1);
        expect(fake.request('turn/interrupt')?.params).toEqual({
            threadId: fake.threadId,
            turnId: fake.lastTurnId,
        });
        expect(replyTo(fake, 0)?.error?.code).toBe(-32_000);
        expect(replyTo(fake, 1)?.error?.message).toContain('Do not ask again');
        turnCompleted(fake, fake.lastTurnId, 'interrupted');
        expect(labels(await finished)).toEqual(['turn-finish']);
        await session.destroy();
    });

    test('a capture that fails still ends the turn, as a failure', async () => {
        const { ask, fake, finished, session } = await askingFake(() =>
            Promise.reject(new Error('journal is read-only'))
        );
        ask(0);
        await flush();
        expect(fake.methods()).toContain('turn/interrupt');
        turnCompleted(fake, fake.lastTurnId, 'interrupted');
        expect(labels(await finished)).toEqual(['turn-finish', 'error:journal is read-only']);
        await session.destroy();
    });
});
