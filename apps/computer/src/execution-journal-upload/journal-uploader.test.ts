import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    type AgentExecutionJournalRecordsFrame,
    EXECUTION_JOURNAL_UPLOAD_FRAME_MAX_BYTES,
    EXECUTION_JOURNAL_VALUE_MAX_CHARS,
    type ExecutionJournalUploadRecord,
    replayExecutionJournalUpload,
} from '@haus/api';
import {
    createComputerExecutionJournal,
    executionJournalPath,
} from '../harness/execution-journal.ts';
import { listUnsyncedJournals } from './journal-upload-ledger.ts';
import { ExecutionJournalUploader } from './journal-uploader.ts';

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function harness(options: { maxQueuedBytes?: number; now?: () => number } = {}) {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-journal-upload-'));
    roots.push(dataRoot);
    const sent: AgentExecutionJournalRecordsFrame[] = [];
    let accepting = true;
    const uploader = new ExecutionJournalUploader({
        dataRoot,
        knownSecrets: [],
        log: () => undefined,
        send: (frame) => {
            if (accepting) {
                sent.push(structuredClone(frame));
            }
            return accepting;
        },
        serverId: 'srv_up',
        ...options,
    });
    const agentRoot = (agentId: string) => join(dataRoot, 'servers', 'srv_up', 'agents', agentId);
    return {
        agentRoot,
        dataRoot,
        sent,
        uploader,
        /** Acknowledges every frame sent so far, as a Server that stored them. */
        ackAll() {
            for (const frame of sent.splice(0)) {
                uploader.acknowledge({
                    agentId: frame.agentId,
                    runId: frame.runId,
                    status: 'stored',
                    throughSequence: frame.records.at(-1)?.sequence ?? 0,
                    type: 'agent-execution-journal-ack',
                });
            }
        },
        offline() {
            accepting = false;
            uploader.disconnected();
        },
        online() {
            accepting = true;
            uploader.connected();
        },
        unsynced: () =>
            listUnsyncedJournals({ serverRoot: join(dataRoot, 'servers', 'srv_up'), since: 0 }),
    };
}

async function liveJournal(h: Awaited<ReturnType<typeof harness>>, agentId: string, runId: string) {
    const agentRoot = h.agentRoot(agentId);
    return createComputerExecutionJournal(
        { agentRoot, runId },
        await h.uploader.journalSink({ agentId, agentRoot, runId })
    );
}

function records(frames: readonly AgentExecutionJournalRecordsFrame[]) {
    return frames.flatMap((frame) => frame.records);
}

test('a live run uploads as it writes and is marked synced once the Server stored its finish', async () => {
    const h = await harness();
    h.online();
    const journal = await liveJournal(h, 'agt_live', 'run_live');
    await journal.recordToolCall({
        input: { command: 'ls' },
        toolCallId: 'call',
        toolName: 'bash',
    });
    await journal.recordToolResult({
        isError: false,
        output: 'README.md',
        preliminary: false,
        toolCallId: 'call',
        toolName: 'bash',
    });
    await journal.finish('completed');
    const uploaded = records(h.sent);
    expect(uploaded.map(({ record }) => record.type)).toEqual([
        'open',
        'tool-call',
        'tool-result',
        'finish',
    ]);
    const sequences = uploaded.map(({ sequence }) => sequence);
    expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(h.sent.at(-1)?.outline).toMatchObject({ runId: 'run_live', status: 'completed' });
    expect(h.sent.slice(0, -1).every((frame) => frame.outline === undefined)).toBe(true);
    const replayed = replayExecutionJournalUpload(
        uploaded.map(({ record }) => record as ExecutionJournalUploadRecord)
    );
    expect(replayed?.tools[0]).toMatchObject({ output: 'README.md', status: 'completed' });

    expect(await h.unsynced()).toHaveLength(1);
    h.ackAll();
    await h.uploader.drained();
    expect(await h.unsynced()).toEqual([]);
    h.online();
    await h.uploader.drained();
    expect(h.sent).toEqual([]);
});

test('frames the Server never acknowledged are resent unchanged after a reconnect', async () => {
    const h = await harness();
    h.online();
    const journal = await liveJournal(h, 'agt_gap', 'run_gap');
    await journal.recordToolCall({ toolCallId: 'one', toolName: 'bash' });
    const firstSent = structuredClone(h.sent);
    h.offline();
    await journal.recordToolCall({ toolCallId: 'two', toolName: 'bash' });
    await journal.finish('completed');
    expect(h.sent).toEqual(firstSent);

    h.sent.splice(0);
    h.online();
    expect(records(h.sent).map(({ record }) => record.type)).toEqual([
        'open',
        'tool-call',
        'tool-call',
        'finish',
    ]);
    expect(h.sent.slice(0, 2)).toEqual(firstSent);
    h.ackAll();
    await h.uploader.drained();
    expect(await h.unsynced()).toEqual([]);
});

test('backfills journals already on disk, newest first, one run at a time', async () => {
    const h = await harness();
    const writes = [
        ['agt_a', 'run_old', 3000],
        ['agt_b', 'run_new', 1000],
        ['agt_a', 'run_mid', 2000],
    ] as const;
    for (const [agentId, runId, secondsAgo] of writes) {
        const journal = await createComputerExecutionJournal({
            agentRoot: h.agentRoot(agentId),
            runId,
        });
        await journal.recordToolCall({ toolCallId: `call_${runId}`, toolName: 'bash' });
        await journal.finish('completed');
        const at = new Date(Date.now() - secondsAgo * 1000);
        await utimes(executionJournalPath(h.agentRoot(agentId), runId), at, at);
    }
    // A run a crash left open uploads from its log, still running.
    const crashed = await createComputerExecutionJournal({
        agentRoot: h.agentRoot('agt_b'),
        runId: 'run_crashed',
    });
    await crashed.recordToolCall({ toolCallId: 'call_crashed', toolName: 'bash' });

    h.online();
    const order: string[] = [];
    for (let pass = 0; pass < 4; pass++) {
        await waitFor(() => h.sent.length > 0);
        expect(new Set(h.sent.map((frame) => frame.runId)).size).toBe(1);
        order.push(h.sent[0]?.runId ?? '');
        const frame = h.sent.at(-1);
        expect(frame?.outline?.runId).toBe(frame?.runId);
        h.ackAll();
    }
    await h.uploader.drained();
    expect(order).toEqual(['run_crashed', 'run_new', 'run_mid', 'run_old']);
    expect(await h.unsynced()).toEqual([]);
});

test('a live run that overflowed while offline resends whole once it settles', async () => {
    const h = await harness({ maxQueuedBytes: 2048 });
    h.offline();
    const journal = await liveJournal(h, 'agt_big', 'run_big');
    for (let index = 0; index < 8; index++) {
        await journal.recordToolCall({
            input: { command: 'x'.repeat(400) },
            toolCallId: `call_${index}`,
            toolName: 'bash',
        });
    }
    await journal.finish('completed');
    h.online();
    await waitFor(() => h.sent.length > 0);
    const uploaded = records(h.sent).map(({ record }) => record as ExecutionJournalUploadRecord);
    expect(uploaded[0]?.type).toBe('open');
    expect(replayExecutionJournalUpload(uploaded)?.tools).toHaveLength(8);
    h.ackAll();
    await h.uploader.drained();
    expect(await h.unsynced()).toEqual([]);
});

test('keeps every frame under the cap by clipping only a record that alone outgrows it', async () => {
    const h = await harness();
    h.online();
    const journal = await liveJournal(h, 'agt_wide', 'run_wide');
    const wide = '界'.repeat(EXECUTION_JOURNAL_VALUE_MAX_CHARS);
    await journal.recordToolResult({
        isError: false,
        output: { a: wide, b: wide, c: wide },
        preliminary: false,
        toolCallId: 'call_wide',
        toolName: 'bash',
    });
    for (const frame of h.sent) {
        expect(Buffer.byteLength(JSON.stringify(frame))).toBeLessThan(
            EXECUTION_JOURNAL_UPLOAD_FRAME_MAX_BYTES
        );
    }
    const result = records(h.sent).find(({ record }) => record.type === 'tool-result');
    expect(JSON.stringify(result)).toContain('more characters for upload]');
});

test('a later uploader sequences above every earlier one', async () => {
    let clock = 1_000_000;
    const first = await harness({ now: () => clock });
    first.online();
    const journal = await liveJournal(first, 'agt_seq', 'run_seq');
    for (let index = 0; index < 5; index++) {
        await journal.recordToolCall({ toolCallId: `call_${index}`, toolName: 'bash' });
    }
    const highest = Math.max(...records(first.sent).map(({ sequence }) => sequence));
    clock += 1;
    const second = await harness({ now: () => clock });
    second.online();
    const resumed = await liveJournal(second, 'agt_seq', 'run_seq');
    await resumed.finish('completed');
    expect(Math.min(...records(second.sent).map(({ sequence }) => sequence))).toBeGreaterThan(
        highest
    );
});

test('a refused run stops resending and counts as handled', async () => {
    const h = await harness();
    h.online();
    const journal = await liveJournal(h, 'agt_gone', 'run_gone');
    await journal.finish('completed');
    for (const frame of h.sent.splice(0)) {
        h.uploader.acknowledge({
            agentId: frame.agentId,
            runId: frame.runId,
            status: 'refused',
            throughSequence: frame.records.at(-1)?.sequence ?? 0,
            type: 'agent-execution-journal-ack',
        });
    }
    await h.uploader.drained();
    expect(await h.unsynced()).toEqual([]);
});

async function waitFor(condition: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(condition()).toBe(true);
}
