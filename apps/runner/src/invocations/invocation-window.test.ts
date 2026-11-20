import { afterEach, describe, expect, test } from 'bun:test';
import { invocationGraceMs, invocationOutcomeNotices } from '@haus/api';
import { manualClock } from '../manual-clock.ts';
import { drainCleanups, live, startedRun } from '../runner-test-server.ts';

afterEach(drainCleanups);

const timeoutMs = 1000;

describe('the Server decides unknown while the runner socket is up', () => {
    test('the Server’s unknown at the timeout plus the grace is what the model sees', async () => {
        const timers = manualClock();
        const { run, server } = await startedRun({}, { invocationClock: timers.clock });

        const pending = run.tools.bash(
            'toolu_1',
            { command: 'make build', timeout: timeoutMs },
            live()
        );
        await server.frame('invocation-request');
        timers.advance(timeoutMs + invocationGraceMs);
        server.answer({
            outcome: 'unknown',
            output: { kind: 'text', text: invocationOutcomeNotices.unknown },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });

        expect(await pending).toEqual({
            content: [{ text: invocationOutcomeNotices.unknown, type: 'text' }],
            invocation: 'unknown',
            isError: true,
        });
    });

    test('a result just past the timeout plus the grace is delivered, not overruled by the runner', async () => {
        const timers = manualClock();
        const { run, server } = await startedRun({}, { invocationClock: timers.clock });

        const pending = run.tools.bash(
            'toolu_1',
            { command: 'make build', timeout: timeoutMs },
            live()
        );
        await server.frame('invocation-request');
        timers.advance(timeoutMs + invocationGraceMs);
        server.answer({
            exitCode: 0,
            outcome: 'completed',
            output: { kind: 'text', text: 'built in 41 s' },
            runId: 'run_1',
            seq: 0,
            toolCallId: 'toolu_1',
        });

        expect(await pending).toEqual({
            content: [{ text: 'built in 41 s', type: 'text' }],
            invocation: 'completed',
            isError: false,
        });
    });
});
