import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { connectRunner, frameOfType, testRunnerToken } from './runner.fixture.ts';

let harness: HausServerHarness;

beforeAll(async () => {
    harness = await startHausServerHarness({ runnerToken: testRunnerToken });
});

afterAll(async () => {
    await harness?.close();
});

test('a runner with the configured token is accepted', async () => {
    const runner = connectRunner(harness, testRunnerToken);

    expect(await runner.next(frameOfType('runner-hello-accepted'))).toEqual({
        type: 'runner-hello-accepted',
    });

    runner.close();
    await runner.closed;
});

test('a runner with the wrong token is refused before anything is sent to it', async () => {
    const runner = connectRunner(harness, `wrong-token-${'w'.repeat(40)}`);

    expect(await runner.closed).toEqual({ code: 4403, reason: 'Runner token was rejected.' });
    expect(runner.frames).toEqual([]);
});

test('a first frame that is not a hello is refused', async () => {
    const runner = connectRunner(harness, 'short');

    expect(await runner.closed).toEqual({ code: 4403, reason: 'Runner token was rejected.' });
    expect(runner.frames).toEqual([]);
});

test('a second runner replaces the first', async () => {
    const first = connectRunner(harness, testRunnerToken);
    await first.next(frameOfType('runner-hello-accepted'));

    const second = connectRunner(harness, testRunnerToken);

    expect(await second.next(frameOfType('runner-hello-accepted'))).toEqual({
        type: 'runner-hello-accepted',
    });
    expect(await first.closed).toEqual({ code: 4409, reason: 'A newer runner attached.' });

    second.close();
    await second.closed;
});

test('a Server without a runner token refuses every runner', async () => {
    const closedServer = await startHausServerHarness({ runnerToken: null });
    try {
        const runner = connectRunner(closedServer, testRunnerToken);

        expect(await runner.closed).toEqual({ code: 4403, reason: 'Runner token was rejected.' });
        expect(runner.frames).toEqual([]);
    } finally {
        await closedServer.close();
    }
});
