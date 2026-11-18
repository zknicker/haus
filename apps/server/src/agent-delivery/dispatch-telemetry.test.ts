import { afterAll, expect, test } from 'bun:test';
import type { AgentCommand } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { traceAgentDispatch } from './dispatch-telemetry.ts';

const runtime = makeTestRuntime();

afterAll(async () => {
    await runtime.dispose();
});

test('attaches trace context only when a start command crosses to Computer', async () => {
    const start = { type: 'start' } as AgentCommand;
    const traced = await traceAgentDispatch(
        runtime,
        { agentId: 'agt_telemetry', serverId: 'srv_telemetry' },
        async () => ({ frame: start })
    );
    const untraced = await traceAgentDispatch(
        undefined,
        { agentId: 'agt', serverId: 'srv' },
        async () => ({
            frame: start,
        })
    );

    expect(traced?.frame.type === 'start' && traced.frame.traceContext?.traceparent).toMatch(
        /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/u
    );
    expect(untraced?.frame).toBe(start);
});
