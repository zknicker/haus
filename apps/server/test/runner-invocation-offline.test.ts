import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { connectRunner, frameOfType, testRunnerToken } from './runner.fixture.ts';

let harness: HausServerHarness;

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
});

afterAll(async () => {
    await harness?.close();
});

test('an invocation answers offline, naming what still works', async () => {
    const runner = connectRunner(harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    const key = { agentId: 'agt_offline', runId: 'run_offline', seq: 0, toolCallId: 'toolu_1' };

    runner.send({ ...key, toolCallId: 'toolu_0', type: 'invocation-cancel' });
    runner.send({
        ...key,
        operation: { command: 'ls drive', kind: 'bash' },
        type: 'invocation-request',
    });

    expect(await runner.next(frameOfType('invocation-result'))).toEqual({
        ...key,
        outcome: 'offline',
        output: {
            kind: 'text',
            text: 'The machine is offline. Nothing ran. `haus` and `execute` still work.',
        },
        truncated: false,
        type: 'invocation-result',
    });
    expect(runner.frames.map((frame) => frame.type)).toEqual([
        'runner-hello-accepted',
        'invocation-result',
    ]);

    runner.close();
    await runner.closed;
});
