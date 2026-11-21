import { afterEach, expect, test } from 'bun:test';
import type { RunnerTurnSpanFrame } from '@haus/api';
import { attachRunner, drainCleanups, serverStandIn } from './runner-test-server.ts';

afterEach(drainCleanups);

const span = (runId: string) =>
    ({
        agentId: 'agt_1',
        endedAtMs: 1_763_640_001_000,
        messageCount: 0,
        modelId: 'claude-opus-4-5',
        outcome: 'completed',
        outputProduced: false,
        runId,
        runtimeId: 'claude-agent-sdk',
        sampled: true,
        spanId: 'c'.repeat(16),
        startedAtMs: 1_763_640_000_000,
        tokenUsage: null,
        traceId: 'a'.repeat(32),
        type: 'runner-turn-span',
    }) satisfies RunnerTurnSpanFrame;

test('a turn span sent while the Server is unreachable is dropped, while product frames queue', async () => {
    const server = serverStandIn();
    const runner = await attachRunner(server, {
        whileConnecting: (link) => {
            link.send(span('run_offline'));
            link.send({ agentId: 'agt_1', runId: 'run_offline', type: 'ack' });
        },
    });

    expect(await server.frame('ack')).toEqual({
        agentId: 'agt_1',
        runId: 'run_offline',
        type: 'ack',
    });
    runner.link.send(span('run_online'));

    expect(await server.frame('runner-turn-span')).toMatchObject({ runId: 'run_online' });
});
