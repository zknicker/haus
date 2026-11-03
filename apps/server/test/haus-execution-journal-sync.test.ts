import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    computerBootstrapProtocolVersion,
    computerProtocolVersion,
    type ExecutionJournalUploadRecord,
} from '@haus/api';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { deleteExpiredExecutionJournals } from '../src/server-agents/execution-journal-retention.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

// A Computer syncs each run's journal over its attachment socket; members read
// only what the Server stored (ADR 0048).
let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let computer: WebSocket;
let serverId: string;
const received: Record<string, unknown>[] = [];
const computerId = 'cmp_journalsync00000';
const agentId = 'agt_journalsync00000';
const strangerId = 'agt_journalstranger0';
const credential = 'journal-sync-computer-credential';
const at = (second: number) => `2026-10-14T12:00:${String(second).padStart(2, '0')}.000Z`;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('cf_sync_owner'));
    outsider = createHausClient(harness, await harness.humans.mintSessionToken('cf_sync_out'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Journal', slug: 'journal-sync' })
    ).id;
    await outsider.trpc.server.create.mutate({ displayName: 'Elsewhere', slug: 'elsewhere' });
    const [user] = (await harness.sql`
        select id from users where auth_subject = 'cf_sync_owner'
    `) as { id: string }[];
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values (${computerId}, ${serverId}, ${user?.id}, ${digest(credential)})
    `;
    // The stranger lives in this Server but is not assigned to this Computer.
    await harness.sql`
        insert into agents (
            id, server_id, handle, display_name, home_timezone,
            computer_id, desired_runtime_id, desired_model_id
        )
        values
            (${agentId}, ${serverId}, 'journal-scout', 'Scout', 'America/New_York',
                ${computerId}, 'codex', 'gpt-5.6-sol'),
            (${strangerId}, ${serverId}, 'journal-stranger', 'Stranger', 'America/New_York',
                null, null, null)
    `;
    computer = new WebSocket(computerSocketUrl());
    computer.addEventListener('message', (event) => received.push(JSON.parse(String(event.data))));
    await new Promise<void>((resolve, reject) => {
        computer.addEventListener('open', () => resolve(), { once: true });
        computer.addEventListener('error', () => reject(new Error('socket failed')), {
            once: true,
        });
    });
    computer.send(JSON.stringify(bootstrapFrame()));
    expect(await waitFor((frame) => frame.type === 'bootstrap-accepted')).toEqual({
        mode: 'ordinary',
        type: 'bootstrap-accepted',
    });
});

afterAll(async () => {
    computer?.close();
    owner?.close();
    outsider?.close();
    await harness?.close();
});

test('stored records replay into the served journal, outline, and change notice', async () => {
    const changes: unknown[] = [];
    const started = Promise.withResolvers<void>();
    const subscription = owner.trpc.agent.onExecutionJournal.subscribe(
        { agentId, runId: 'run_live', serverId },
        {
            onData: (change) => changes.push(change),
            onError: (error) => started.reject(error),
            onStarted: () => started.resolve(),
        }
    );
    await started.promise;
    // tRPC reports started before the Server registers its listener.
    await Bun.sleep(100);

    expect(await upload('run_other', [opened('run_other')], 1)).toBe('stored');
    expect(await upload('run_live', [opened('run_live'), toolCall], 10)).toBe('stored');
    expect(
        await upload('run_live', [toolResult, finish], 20, {
            durationMs: 3000,
            runId: 'run_live',
            startedAt: at(0),
            status: 'completed',
            steps: [],
        })
    ).toBe('stored');
    const journal = await owner.trpc.agent.executionJournal.query({
        agentId,
        runId: 'run_live',
        serverId,
    });
    expect(journal).toMatchObject({ runId: 'run_live', status: 'available' });
    if (journal.status !== 'available') {
        throw new Error('Expected a stored journal.');
    }
    expect(journal.journal).toMatchObject({ endedAt: at(3), status: 'completed' });
    expect(journal.journal.tools.map((tool) => [tool.toolCallId, tool.status])).toEqual([
        ['call_ls', 'completed'],
    ]);
    expect(
        await owner.trpc.agent.executionOutlines.query({
            agentId,
            runIds: ['run_live', 'run_other'],
            serverId,
        })
    ).toMatchObject({
        outlines: [
            { outline: { runId: 'run_live', status: 'completed' }, status: 'available' },
            { runId: 'run_other', status: 'missing' },
        ],
    });
    for (let attempt = 0; attempt < 200 && changes.length === 0; attempt += 1) {
        await Bun.sleep(10);
    }
    await Bun.sleep(1200);
    subscription.unsubscribe();
    // Two uploads inside one second collapse into a leading and a trailing notice.
    expect(changes).toEqual([
        { agentId, runId: 'run_live' },
        { agentId, runId: 'run_live' },
    ]);
});

test('a resend is idempotent and a later open replaces the stored run', async () => {
    const records = [opened('run_resend'), toolCall, toolResult, finish];
    expect(await upload('run_resend', records, 100)).toBe('stored');
    expect(await upload('run_resend', records, 100)).toBe('stored');
    expect(await storedRecords('run_resend')).toBe(4);
    expect(await upload('run_resend', [opened('run_resend'), toolCall], 200)).toBe('stored');
    expect(await upload('run_resend', [finish], 300)).toBe('stored');
    // A late resend of the opening frame keeps what was stored after it.
    expect(await upload('run_resend', [opened('run_resend'), toolCall], 200)).toBe('stored');
    expect(await storedRecords('run_resend')).toBe(3);
    const journal = await owner.trpc.agent.executionJournal.query({
        agentId,
        runId: 'run_resend',
        serverId,
    });
    expect(journal.status === 'available' && journal.journal.status).toBe('completed');
});

test('records for an Agent this Computer does not run are refused and not stored', async () => {
    expect(await upload('run_stranger', [opened('run_stranger')], 1, undefined, strangerId)).toBe(
        'refused'
    );
    const [row] = await harness.sql`
        select count(*)::int as count from agent_execution_journals where agent_id = ${strangerId}
    `;
    expect(row?.count).toBe(0);
});

test('someone outside the Server cannot read or watch its journals', async () => {
    const input = { agentId, runId: 'run_live', serverId };
    await expect(outsider.trpc.agent.executionJournal.query(input)).rejects.toThrow(
        /member|forbidden|not found/i
    );
    const refused = Promise.withResolvers<unknown>();
    const subscription = outsider.trpc.agent.onExecutionJournal.subscribe(input, {
        onData: () => undefined,
        onError: (error) => refused.resolve(error),
    });
    expect(String(await refused.promise)).toMatch(/member|forbidden|not found/i);
    subscription.unsubscribe();
});

test('the retention sweep deletes runs older than thirty days with their records', async () => {
    expect(await upload('run_ancient', [opened('run_ancient')], 1)).toBe('stored');
    await harness.sql`
        update agent_execution_journals set run_started_at = now() - interval '31 days'
        where run_id = 'run_ancient'
    `;
    const connection = await connectHausDatabase(harness.databaseUrl);
    try {
        expect(await deleteExpiredExecutionJournals(connection.db, new Date())).toEqual([
            'run_ancient',
        ]);
    } finally {
        await connection.close();
    }
    expect(await storedRecords('run_ancient')).toBe(0);
    expect(await storedRecords('run_live')).toBe(4);
});

const toolCall: ExecutionJournalUploadRecord = {
    input: { command: 'ls' },
    occurredAt: at(1),
    toolCallId: 'call_ls',
    toolName: 'bash',
    type: 'tool-call',
};
const toolResult: ExecutionJournalUploadRecord = {
    isError: false,
    occurredAt: at(2),
    output: 'README.md',
    preliminary: false,
    toolCallId: 'call_ls',
    toolName: 'bash',
    type: 'tool-result',
};
const finish: ExecutionJournalUploadRecord = { at: at(3), status: 'completed', type: 'finish' };

function opened(runId: string): ExecutionJournalUploadRecord {
    return { document: { runId, startedAt: at(0), status: 'running', tools: [] }, type: 'open' };
}

async function upload(
    runId: string,
    records: ExecutionJournalUploadRecord[],
    firstSequence: number,
    outline?: unknown,
    uploader = agentId
): Promise<unknown> {
    const sequenced = records.map((record, index) => ({ record, sequence: firstSequence + index }));
    const throughSequence = firstSequence + records.length - 1;
    const already = received.length;
    computer.send(
        JSON.stringify({
            agentId: uploader,
            outline,
            records: sequenced,
            runId,
            runStartedAt: at(0),
            type: 'agent-execution-journal-records',
        })
    );
    const ack = await waitFor(
        (frame) =>
            frame.type === 'agent-execution-journal-ack' &&
            frame.runId === runId &&
            frame.throughSequence === throughSequence,
        already
    );
    expect(ack).toMatchObject({ agentId: uploader });
    return ack.status;
}

async function storedRecords(runId: string): Promise<number> {
    const [row] = await harness.sql`
        select count(*)::int as count from agent_execution_journal_records where run_id = ${runId}
    `;
    return row?.count ?? 0;
}

async function waitFor(
    matches: (frame: Record<string, unknown>) => boolean,
    from = 0
): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 500; attempt += 1) {
        const frame = received.slice(from).find(matches);
        if (frame) {
            return frame;
        }
        await Bun.sleep(10);
    }
    throw new Error('The Server never sent the expected frame.');
}

function bootstrapFrame() {
    return {
        architecture: 'arm64',
        bootstrapProtocolVersion: computerBootstrapProtocolVersion,
        credential,
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '9.4.0',
        protocolVersion: computerProtocolVersion,
        type: 'bootstrap',
        update: {
            detail: null,
            phase: 'idle',
            targetVersion: null,
            updatedAt: '2026-10-09T12:00:00.000Z',
        },
    };
}

function digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
}

function computerSocketUrl() {
    const url = new URL('/computer/attachment', harness.url);
    url.protocol = 'ws:';
    return url;
}
