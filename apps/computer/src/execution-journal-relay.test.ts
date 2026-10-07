import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentExecutionOutlinesResultSchema } from '@haus/api';
import {
    parseExecutionJournalRequest,
    parseExecutionOutlinesRequest,
    readExecutionJournalRequest,
    readExecutionOutlinesRequest,
} from './execution-journal-relay.ts';
import { createComputerExecutionJournal } from './harness/execution-journal.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

test('serves one local journal only for the attached Server partition', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-journal-relay-'));
    roots.push(dataRoot);
    const journal = await createComputerExecutionJournal({
        agentRoot: join(dataRoot, 'servers', 'srv_attached', 'agents', 'agt_attached'),
        runId: 'run_attached',
    });
    await journal.finish('completed');

    const request = parseExecutionJournalRequest({
        agentId: 'agt_attached',
        requestId: 'req_detail',
        runId: 'run_attached',
        type: 'agent-execution-journal-request',
    });
    expect(request).not.toBeNull();
    await expect(
        readExecutionJournalRequest({
            dataRoot,
            request: request!,
            serverId: 'srv_attached',
        })
    ).resolves.toMatchObject({ status: 'available', journal: { runId: 'run_attached' } });
});

test('serves a still-running turn from its append-only log', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-journal-running-'));
    roots.push(dataRoot);
    const journal = await createComputerExecutionJournal({
        agentRoot: join(dataRoot, 'servers', 'srv_attached', 'agents', 'agt_running'),
        runId: 'run_live',
    });
    await journal.recordToolCall({
        input: { command: 'sleep 100' },
        toolCallId: 'call_live',
        toolName: 'bash',
    });

    const request = parseExecutionJournalRequest({
        agentId: 'agt_running',
        requestId: 'req_live',
        runId: 'run_live',
        type: 'agent-execution-journal-request',
    });
    expect(request).not.toBeNull();
    const result = await readExecutionJournalRequest({
        dataRoot,
        request: request!,
        serverId: 'srv_attached',
    });
    expect(result).toMatchObject({
        journal: { runId: 'run_live', status: 'running' },
        status: 'available',
    });
    expect(result.status === 'available' && result.journal.tools).toMatchObject([
        { status: 'running', toolCallId: 'call_live', toolName: 'bash' },
    ]);
});

test('returns an explicit missing result instead of inventing local detail', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-journal-missing-'));
    roots.push(dataRoot);
    const request = parseExecutionJournalRequest({
        agentId: 'agt_missing',
        requestId: 'req_missing',
        runId: 'run_missing',
        type: 'agent-execution-journal-request',
    });
    expect(request).not.toBeNull();
    await expect(
        readExecutionJournalRequest({ dataRoot, request: request!, serverId: 'srv_attached' })
    ).resolves.toEqual({
        agentId: 'agt_missing',
        reason: 'missing',
        requestId: 'req_missing',
        runId: 'run_missing',
        status: 'unavailable',
        type: 'agent-execution-journal-result',
    });
});

test('returns explicit missing for a run id that cannot address a local file', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-journal-invalid-'));
    roots.push(dataRoot);
    const request = parseExecutionJournalRequest({
        agentId: 'agt_invalid',
        requestId: 'req_invalid',
        runId: '../escape',
        type: 'agent-execution-journal-request',
    });
    expect(request).not.toBeNull();
    await expect(
        readExecutionJournalRequest({ dataRoot, request: request!, serverId: 'srv_attached' })
    ).resolves.toMatchObject({ reason: 'missing', status: 'unavailable' });
});

test('outlines every requested run in one answer and names the missing ones', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-outline-relay-'));
    roots.push(dataRoot);
    const journal = await createComputerExecutionJournal({
        agentRoot: join(dataRoot, 'servers', 'srv_attached', 'agents', 'agt_attached'),
        runId: 'run_present',
    });
    await journal.finish('completed');

    const request = parseExecutionOutlinesRequest({
        agentId: 'agt_attached',
        requestId: 'req_outlines',
        runIds: ['run_present', 'run_absent'],
        type: 'agent-execution-outlines-request',
    });
    expect(request).not.toBeNull();
    const result = await readExecutionOutlinesRequest({
        dataRoot,
        request: request!,
        serverId: 'srv_attached',
    });
    expect(agentExecutionOutlinesResultSchema.parse(result)).toEqual(result);
    expect(result.outlines).toMatchObject([
        { outline: { runId: 'run_present', status: 'completed', steps: [] }, status: 'available' },
        { reason: 'missing', runId: 'run_absent', status: 'unavailable' },
    ]);

    // Another Server's partition never answers for this one.
    const foreign = await readExecutionOutlinesRequest({
        dataRoot,
        request: request!,
        serverId: 'srv_other',
    });
    expect(foreign.outlines.every((entry) => entry.status === 'unavailable')).toBe(true);
});
