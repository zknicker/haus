import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ExecutionJournalUploadRecord } from '@haus/api';
import { createHomedAgent } from './agent-home.fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    reportRunnerModels,
    testRunnerToken,
} from './runner.fixture.ts';

const computerId = `cmp_${'j'.repeat(16)}`;
const at = (second: number) => `2026-11-20T12:00:${String(second).padStart(2, '0')}.000Z`;
let harness: HausServerHarness;
let owner: HausClient;
let runner: RunnerClient;
let serverId: string;
let agentId: string;
let runId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
    harness.humans.setVerifiedEmails('user_journal_owner', ['grace@haus.test']);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_journal_owner'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Journal HQ', slug: 'journal-hq' })
    ).id;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Grace',
        handle: 'grace',
        serverId,
    });
    const userId = harness.humans.userIdForSubject('user_journal_owner');
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId}, ${serverId}, ${userId}, ${'f'.repeat(64)},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    await reportRunnerModels(harness);
    agentId = (
        await createHomedAgent(owner, {
            computerId,
            displayName: 'Ledger',
            handle: 'ledger',
            modelId: 'gpt-5.6-sol',
            runtimeId: 'codex',
            serverId,
        })
    ).agent.id;
    const dmChatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;
    await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'What changed?',
        nonce: 'journal_dm_first',
        serverId,
    });
    runner = connectRunner(harness, testRunnerToken);
    const start = await runner.next(frameOfType('runner-start'));
    runId = (start.start as { runId: string }).runId;
    runner.send({ agentId, runId, type: 'ack' });
});

afterAll(async () => {
    runner?.close();
    owner?.close();
    await harness?.close();
});

test('the runner journal of a run the Server started on it is stored and served', async () => {
    runner.send(recordsFrame(runId, [opened(runId), toolCall, toolResult, finish]));

    expect(await runner.next(frameOfType('agent-execution-journal-ack', { runId }))).toEqual({
        agentId,
        runId,
        status: 'stored',
        throughSequence: 4,
        type: 'agent-execution-journal-ack',
    });
    const journal = await owner.trpc.agent.executionJournal.query({ agentId, runId, serverId });
    if (journal.status !== 'available') {
        throw new Error('Expected the stored journal.');
    }
    expect(journal.journal).toMatchObject({ endedAt: at(3), status: 'completed' });
    expect(journal.journal.tools.map((tool) => [tool.toolCallId, tool.status])).toEqual([
        ['call_ls', 'completed'],
    ]);
});

test('runner journal records for a run the Server never started on the runner are refused', async () => {
    const forged = 'run_forgedjournal000';
    runner.send(recordsFrame(forged, [opened(forged)]));

    expect(
        await runner.next(frameOfType('agent-execution-journal-ack', { runId: forged }))
    ).toMatchObject({ status: 'refused', throughSequence: 1 });
    const [row] = await harness.sql`
        select count(*)::int as count from agent_execution_journals where run_id = ${forged}
    `;
    expect(row?.count).toBe(0);
});

const toolCall: ExecutionJournalUploadRecord = {
    input: { command: 'git log -1' },
    occurredAt: at(1),
    toolCallId: 'call_ls',
    toolName: 'bash',
    type: 'tool-call',
};
const toolResult: ExecutionJournalUploadRecord = {
    isError: false,
    occurredAt: at(2),
    output: 'Fix the deploy.',
    preliminary: false,
    toolCallId: 'call_ls',
    toolName: 'bash',
    type: 'tool-result',
};
const finish: ExecutionJournalUploadRecord = { at: at(3), status: 'completed', type: 'finish' };

function opened(run: string) {
    return {
        document: { runId: run, startedAt: at(0), status: 'running', tools: [] },
        type: 'open',
    } satisfies ExecutionJournalUploadRecord;
}

function recordsFrame(run: string, records: ExecutionJournalUploadRecord[]) {
    return {
        agentId,
        records: records.map((record, index) => ({ record, sequence: index + 1 })),
        runId: run,
        runStartedAt: at(0),
        type: 'agent-execution-journal-records',
    };
}
