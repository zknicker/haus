import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentContextReport, AgentContextSnapshot } from '@haus/api';
import { type InvocationHarness, startInvocationHarness } from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    reportRunnerModels,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

let setup: InvocationHarness;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'runner-agent-context' });
});

afterAll(async () => {
    await setup?.close();
});

test('the newest snapshot of the current session is what members read', async () => {
    const generation = await sessionGeneration();
    const runner = await attachRunner();
    try {
        expect(await readContext()).toEqual({ snapshot: null });
        const newer = snapshot(generation, '2026-11-20T10:05:00.000Z', 120_000);
        runner.send(report('run_context_new', newer));
        runner.send(
            report('run_context_old', snapshot(generation, '2026-11-20T10:00:00.000Z', 90_000))
        );
        runner.send(
            report('run_context_retired', snapshot(generation - 1, '2026-11-20T10:09:00.000Z', 1))
        );
        await reportRunnerModels(setup.harness, { attached: runner });

        expect(await readContext()).toEqual({ snapshot: newer });
    } finally {
        runner.close();
        await runner.closed;
    }
});

test('a session rotation hides the retired session’s snapshot', async () => {
    const generation = await sessionGeneration();
    await setup.harness.sql`
        update agents set session_generation = ${generation + 1} where id = ${setup.agentId}
    `;

    expect(await readContext()).toEqual({ snapshot: null });
});

function readContext() {
    return setup.owner.trpc.agent.context.query({
        agentId: setup.agentId,
        serverId: setup.serverId,
    });
}

async function sessionGeneration() {
    const [row] = await setup.harness.sql<{ session_generation: number }[]>`
        select session_generation from agents where id = ${setup.agentId}
    `;
    if (!row) {
        throw new Error('The fixture Agent is missing.');
    }
    return row.session_generation;
}

function report(runId: string, context: AgentContextSnapshot) {
    const frame: AgentContextReport = { runId, snapshot: context, type: 'agent-context' };
    return frame;
}

function snapshot(generation: number, measuredAt: string, conversation: number) {
    const context: AgentContextSnapshot = {
        agentId: setup.agentId,
        compactAtTokens: 400_000,
        contextWindow: 1_000_000,
        measuredAt,
        modelId: 'claude-opus-5-5',
        sections: [
            { id: 'system-prompt', tokens: 12_400 },
            { id: 'tools', tokens: 16_300 },
            { id: 'skills', tokens: 1400 },
            { id: 'memory', tokens: 4700 },
            { id: 'conversation', tokens: conversation },
        ],
        sessionGeneration: generation,
        source: 'harness',
        usedTokens: 34_800 + conversation,
    };
    return context;
}

async function attachRunner() {
    const runner: RunnerClient = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    return runner;
}
