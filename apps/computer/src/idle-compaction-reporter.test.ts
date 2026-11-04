import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AgentIdleCompactionReport, agentIdleCompactionReportSchema } from '@haus/api';
import { makeDaemonRuntime } from './daemon-runtime.ts';
import { readComputerExecutionJournal } from './harness/execution-journal.ts';
import { createIdleCompactionReporter } from './idle-compaction-reporter.ts';
import type { IdleCompactionResult } from './runtime/idle-compaction.ts';

const root = await mkdtemp(join(tmpdir(), 'haus-idle-compaction-reporter-'));
afterAll(() => rm(root, { force: true, recursive: true }));
const agentsDir = join(root, 'servers', 'srv_1', 'agents');
const identity = { launchKey: 'launch', nativeSessionId: 'session', runtimeId: 'claude-code' };
const result: IdleCompactionResult = {
    costUsd: 1.25,
    endedAt: new Date('2026-11-04T10:01:00.000Z'),
    modelId: 'claude-opus-5-5',
    startedAt: new Date('2026-11-04T10:00:00.000Z'),
    summary: 'The Agent was migrating the billing tables.',
    tokensAfter: 41_000,
    tokensBefore: 812_000,
    usage: {
        cacheReadTokens: 800_000,
        cacheWriteTokens: 2000,
        inputTokens: 803_000,
        outputTokens: 9000,
        totalTokens: 812_000,
    },
};

function reporter(busyAgents: string[] = []) {
    const sent: AgentIdleCompactionReport[] = [];
    const hooks = createIdleCompactionReporter({
        agentBusy: (agentId) => busyAgents.includes(agentId),
        agentsDir,
        journalSink: () => Promise.resolve(undefined),
        runtime: makeDaemonRuntime(),
        send: (frame) => {
            sent.push(frame);
            return true;
        },
        serverId: 'srv_1',
    });
    return { hooks, sent };
}

test('only an Agent’s main session compacts, and never while Haus is using the Agent', () => {
    const { hooks } = reporter(['agt_busy']);
    expect(hooks.compactable(join(agentsDir, 'agt_1'))).toBe(true);
    expect(hooks.compactable(`${join(agentsDir, 'agt_1')}#heartbeat-1`)).toBe(false);
    expect(hooks.compactable(join(root, 'elsewhere', 'agt_1'))).toBe(false);
    expect(hooks.busy(join(agentsDir, 'agt_1'))).toBe(false);
    expect(hooks.busy(join(agentsDir, 'agt_busy'))).toBe(true);
});

test('a finished compaction is journaled as the compaction tool pair and reported for Usage', async () => {
    const { hooks, sent } = reporter();
    const agentRoot = join(agentsDir, 'agt_1');
    await hooks.report(agentRoot, identity, result);
    expect(sent).toHaveLength(1);
    const [report] = sent;
    expect(agentIdleCompactionReportSchema.parse(report)).toEqual({
        agentId: 'agt_1',
        compactionId: expect.stringMatching(/^compaction-/u),
        costUsd: 1.25,
        endedAt: '2026-11-04T10:01:00.000Z',
        modelId: 'claude-opus-5-5',
        runtimeId: 'claude-code',
        startedAt: '2026-11-04T10:00:00.000Z',
        tokenUsage: result.usage,
        tokensAfter: 41_000,
        tokensBefore: 812_000,
        type: 'agent-idle-compaction',
    });
    const journal = await readComputerExecutionJournal(agentRoot, report?.compactionId ?? '');
    expect(journal?.status).toBe('completed');
    expect(journal?.tools).toHaveLength(1);
    expect(journal?.tools[0]).toMatchObject({
        toolName: 'compaction',
        output: {
            summary: 'The Agent was migrating the billing tables.',
            tokensAfter: 41_000,
            tokensBefore: 812_000,
            trigger: 'idle',
        },
        status: 'completed',
    });
});
