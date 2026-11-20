import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentIdleCompactionReportSchema, type RunnerUpFrame } from '@haus/api';
import {
    type AgentSessionRecord,
    readAgentSession,
    writeAgentSession,
} from '../turn/session-file.ts';
import { createIdleCompactionReporter } from './idle-compaction-reporter.ts';
import type { IdleCompactionResult } from './idle-compaction.ts';

const root = await mkdtemp(join(tmpdir(), 'haus-runner-idle-compaction-'));
afterAll(() => rm(root, { force: true, recursive: true }));

const result: IdleCompactionResult = {
    costUsd: 0.42,
    endedAt: new Date('2026-11-20T10:01:00.000Z'),
    modelId: 'claude-opus-4-7',
    startedAt: new Date('2026-11-20T10:00:00.000Z'),
    summary: 'summary',
    tokensAfter: 30_000,
    tokensBefore: 400_000,
    usage: {
        cacheReadTokens: 300_000,
        cacheWriteTokens: 1000,
        inputTokens: 301_000,
        outputTokens: 4000,
        totalTokens: 305_000,
    },
};

const session: AgentSessionRecord = {
    bootstrapFingerprint: 'boot-1',
    deliveredInstructionFingerprint: 'composed-2',
    deliveredMemoryDigest: 'memory-1',
    deliveredRuleDigests: { 'haus/AGENTS.md': 'rules-1' },
    generation: 3,
    harness: 'claude-agent-sdk',
    interruptedTurn: false,
    launchedInstructionFingerprint: 'launched-1',
    modelId: 'claude-opus-4-7',
    nativeSessionId: '6b0b7f1e-5f0e-4a43-9f0d-3d7c9b2c1a11',
};

function reporter(options: { busy?: boolean } = {}) {
    const sent: RunnerUpFrame[] = [];
    const lines: string[] = [];
    const hooks = createIdleCompactionReporter({
        agentBusy: () => options.busy ?? false,
        link: { send: (frame) => sent.push(frame) },
        log: (line) => lines.push(line),
    });
    return { hooks, lines, sent };
}

test('a finished compaction goes up the runner socket as an agent-idle-compaction report', async () => {
    const { hooks, sent } = reporter();
    const agentDir = join(root, 'agents', 'agt_one');
    const owner = { agentDir, agentId: 'agt_one', runtimeId: 'claude-agent-sdk' };
    await hooks.report('agt_one', { owner }, result);
    expect(sent).toHaveLength(1);
    const report = agentIdleCompactionReportSchema.parse(sent[0]);
    expect(report).toMatchObject({
        agentId: 'agt_one',
        costUsd: 0.42,
        endedAt: '2026-11-20T10:01:00.000Z',
        modelId: 'claude-opus-4-7',
        runtimeId: 'claude-agent-sdk',
        startedAt: '2026-11-20T10:00:00.000Z',
        tokenUsage: result.usage,
        tokensAfter: 30_000,
        tokensBefore: 400_000,
        type: 'agent-idle-compaction',
    });
    await hooks.report('agt_one', { owner }, result);
    expect(sent.map((frame) => frame.type)).toEqual([
        'agent-idle-compaction',
        'agent-idle-compaction',
    ]);
    expect(
        new Set(sent.map((frame) => (frame as { compactionId: string }).compactionId)).size
    ).toBe(2);
});

test('a session that lost its owner reports nothing', async () => {
    const { hooks, sent } = reporter();
    await hooks.report('agt_one', { owner: null }, result);
    expect(sent).toEqual([]);
});

test('a compaction resets the memory, rule and instruction receipts so the next turn carries them again', async () => {
    const { hooks } = reporter();
    const agentDir = join(root, 'agents', 'agt_two');
    await writeAgentSession(agentDir, session);
    await hooks.compacted('agt_two', {
        owner: { agentDir, agentId: 'agt_two', runtimeId: 'claude-agent-sdk' },
    });
    expect(await readAgentSession(agentDir)).toEqual({
        ...session,
        deliveredInstructionFingerprint: 'launched-1',
        deliveredMemoryDigest: null,
        deliveredRuleDigests: {},
    });
});

test('an Agent with no session file has no receipts to reset, and an unreadable one is logged', async () => {
    const { hooks, lines } = reporter();
    const bare = join(root, 'agents', 'agt_three');
    await hooks.compacted('agt_three', {
        owner: { agentDir: bare, agentId: 'agt_three', runtimeId: 'claude-agent-sdk' },
    });
    expect(await readAgentSession(bare)).toBeNull();
    expect(lines).toEqual([]);

    const broken = join(root, 'agents', 'agt_four');
    await Bun.write(join(broken, 'session.json'), '{not json');
    await hooks.compacted('agt_four', {
        owner: { agentDir: broken, agentId: 'agt_four', runtimeId: 'claude-agent-sdk' },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("could not reset agt_four's delivery receipts");
});

test('the Agent is busy exactly when the turn host says so', () => {
    expect(reporter({ busy: true }).hooks.busy('agt_one')).toBe(true);
    expect(reporter().hooks.busy('agt_one')).toBe(false);
});
