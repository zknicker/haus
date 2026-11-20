import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type AgentExecutionJournalRecordsFrame,
    type RunnerUpFrame,
    replayExecutionJournalUpload,
} from '@haus/api';
import { createIdleCompactionReporter } from '../claude/idle-compaction-reporter.ts';
import { createJournalUploads } from './journal-uploads.ts';

let dataDir: string;
afterEach(async () => {
    await rm(dataDir, { force: true, recursive: true });
});

test('an idle compaction is journaled as the compaction tool pair before its report goes up', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-idle-journal-'));
    const uploads = createJournalUploads({
        dataDir,
        environment: {},
        log: () => undefined,
        runnerToken: 'runner-token-0123456789abcdef0123456789',
    });
    const order: string[] = [];
    const frames: AgentExecutionJournalRecordsFrame[] = [];
    uploads.connected((frame) => {
        order.push('journal');
        frames.push(frame);
        return true;
    });
    const sent: RunnerUpFrame[] = [];
    const hooks = createIdleCompactionReporter({
        agentBusy: () => false,
        link: {
            send: (frame) => {
                order.push(frame.type);
                sent.push(frame);
            },
        },
        log: () => undefined,
        uploads,
    });
    const agentDir = join(dataDir, 'agents', 'agt_one');
    await hooks.report(
        'agt_one',
        { owner: { agentDir, agentId: 'agt_one', runtimeId: 'claude-agent-sdk' } },
        {
            costUsd: 0.1,
            endedAt: new Date('2026-11-20T10:01:00.000Z'),
            modelId: 'claude-opus-4-7',
            startedAt: new Date('2026-11-20T10:00:00.000Z'),
            summary: 'the summary',
            tokensAfter: 30_000,
            tokensBefore: 400_000,
            usage: null,
        }
    );
    await uploads.drained();

    const report = sent[0] as { compactionId: string; type: string };
    expect(report.type).toBe('agent-idle-compaction');
    expect(order.at(-1)).toBe('agent-idle-compaction');
    expect(order.slice(0, -1).every((entry) => entry === 'journal')).toBe(true);
    expect(frames.every((frame) => frame.runId === report.compactionId)).toBe(true);
    const document = replayExecutionJournalUpload(
        frames.flatMap((frame) => frame.records.map(({ record }) => record))
    );
    expect(document).toMatchObject({ runId: report.compactionId, status: 'completed' });
    expect(document?.tools).toMatchObject([
        {
            final: {
                output: {
                    summary: 'the summary',
                    tokensAfter: 30_000,
                    tokensBefore: 400_000,
                    trigger: 'idle',
                },
            },
            status: 'completed',
            toolName: 'compaction',
        },
    ]);
});

test('a compaction whose journal cannot be written is still reported', async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'haus-runner-idle-journal-'));
    const lines: string[] = [];
    const sent: RunnerUpFrame[] = [];
    const hooks = createIdleCompactionReporter({
        agentBusy: () => false,
        link: { send: (frame) => sent.push(frame) },
        log: (line) => lines.push(line),
    });
    await Bun.write(join(dataDir, 'blocked'), 'a file where the agent directory should be');
    await hooks.report(
        'agt_one',
        {
            owner: {
                agentDir: join(dataDir, 'blocked', 'agt_one'),
                agentId: 'agt_one',
                runtimeId: 'claude-agent-sdk',
            },
        },
        {
            costUsd: null,
            endedAt: new Date(1),
            modelId: 'claude-opus-4-7',
            startedAt: new Date(0),
            summary: null,
            tokensAfter: null,
            tokensBefore: null,
            usage: null,
        }
    );
    expect(sent.map((frame) => frame.type)).toEqual(['agent-idle-compaction']);
    expect(lines.some((line) => line.includes('could not journal'))).toBe(true);
});
