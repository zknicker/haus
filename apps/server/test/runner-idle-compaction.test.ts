import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentIdleCompactionReport } from '@haus/api';
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
    setup = await startInvocationHarness({ slug: 'runner-idle-compaction' });
});

afterAll(async () => {
    await setup?.close();
});

test('every runner attach hears the stored setting, and every change reaches the attached runner', async () => {
    const setting = (on: boolean) =>
        setup.owner.trpc.server.setIdleCompaction.mutate({
            idleCompaction: on,
            serverId: setup.serverId,
        });
    const first = await attachRunner();
    try {
        await settingsCount(first, 1);
        expect(settings(first)).toEqual([[]]);
        await setting(true);
        await settingsCount(first, 2);
        expect(settings(first)).toEqual([[], [setup.serverId]]);
    } finally {
        first.close();
        await first.closed;
    }
    const second = await attachRunner();
    try {
        await settingsCount(second, 1);
        expect(settings(second)).toEqual([[setup.serverId]]);
        await setting(false);
        await settingsCount(second, 2);
        expect(settings(second)).toEqual([[setup.serverId], []]);
    } finally {
        second.close();
        await second.closed;
    }
});

test('a runner idle compaction is the Agent’s completed turn, counted once in Usage', async () => {
    const runner = await attachRunner();
    const report: AgentIdleCompactionReport = {
        agentId: setup.agentId,
        compactionId: 'compaction-4d1b7e20-runner',
        costUsd: 1.25,
        endedAt: '2026-11-20T10:01:00.000Z',
        modelId: 'claude-opus-4-7',
        runtimeId: 'claude',
        startedAt: '2026-11-20T10:00:00.000Z',
        tokenUsage: {
            cacheReadTokens: 400_000,
            cacheWriteTokens: 1000,
            inputTokens: 401_000,
            outputTokens: 4000,
            totalTokens: 405_000,
        },
        tokensAfter: 30_000,
        tokensBefore: 405_000,
        type: 'agent-idle-compaction',
    };
    try {
        runner.send(report);
        runner.send(report);
        await reportRunnerModels(setup.harness, { attached: runner });
        const rows = await setup.harness.sql`
            select run_id, status, summary, message_count, output_produced, total_tokens
            from agent_turns where run_id = ${report.compactionId}
        `;
        expect(rows).toEqual([
            {
                message_count: 0,
                output_produced: false,
                run_id: report.compactionId,
                status: 'completed',
                summary: 'Compacted idle context: 405K → 30K tokens.',
                total_tokens: 405_000,
            },
        ]);
        const usage = await setup.harness.sql`
            select sum(total_tokens)::int as total from agent_token_usage_daily
            where agent_id = ${setup.agentId} and date = '2026-11-20'
        `;
        expect(usage).toEqual([{ total: 405_000 }]);
    } finally {
        runner.close();
        await runner.closed;
    }
});

test('two Servers that disagree: the runner hears only the Server that turned idle compaction on', async () => {
    const other = (
        await setup.owner.trpc.server.create.mutate({ displayName: 'Other', slug: 'idle-other' })
    ).id;
    await setup.owner.trpc.server.setIdleCompaction.mutate({
        idleCompaction: true,
        serverId: other,
    });
    await setup.owner.trpc.server.setIdleCompaction.mutate({
        idleCompaction: false,
        serverId: setup.serverId,
    });
    const runner = await attachRunner();
    try {
        await settingsCount(runner, 1);
        expect(settings(runner).at(-1)).toEqual([other]);
    } finally {
        runner.close();
        await runner.closed;
    }
});

async function attachRunner() {
    const runner: RunnerClient = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    return runner;
}

function settings(runner: RunnerClient) {
    return runner.frames
        .filter((frame) => frame.type === 'runner-runtime-settings')
        .map((frame) => frame.idleCompactionServerIds);
}

function settingsCount(runner: RunnerClient, count: number) {
    return runner.next(() => settings(runner).length >= count);
}
