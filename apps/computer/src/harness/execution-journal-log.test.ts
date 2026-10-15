import { afterEach, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXECUTION_JOURNAL_VALUE_MAX_CHARS, type ExecutionJournalDocument } from '@haus/api';
import {
    createComputerExecutionJournal,
    executionJournalPath,
    readComputerExecutionJournal,
} from './execution-journal.ts';
import { type JournalRecord, replayJournalRecords } from './execution-journal-records.ts';
import { executionJournalLogPath } from './execution-journal-store.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function root(prefix: string) {
    const created = await mkdtemp(join(tmpdir(), prefix));
    roots.push(created);
    return created;
}

function logPath(agentRoot: string, runId: string) {
    return executionJournalLogPath(executionJournalPath(agentRoot, runId));
}

async function readLogLines(agentRoot: string, runId: string) {
    return (await readFile(logPath(agentRoot, runId), 'utf8')).split('\n');
}

function lines(records: JournalRecord[]) {
    return [...records.map((record) => JSON.stringify(record)), ''];
}

const openRecord: JournalRecord = {
    document: {
        runId: 'run_pure',
        startedAt: '2026-08-11T00:00:00.000Z',
        status: 'running',
        tools: [],
    },
    type: 'open',
};

test('replays every record kind back into the document the turn held', () => {
    const document = replayJournalRecords(
        lines([
            openRecord,
            {
                input: { command: 'echo one' },
                nativeName: 'bash',
                occurredAt: '2026-08-11T00:00:01.000Z',
                toolCallId: 'call_one',
                toolName: 'bash',
                type: 'tool-call',
            },
            {
                isError: false,
                occurredAt: '2026-08-11T00:00:02.000Z',
                output: 'partial',
                preliminary: true,
                toolCallId: 'call_one',
                toolName: 'bash',
                type: 'tool-result',
            },
            {
                isError: true,
                occurredAt: '2026-08-11T00:00:03.000Z',
                output: 'boom',
                preliminary: false,
                toolCallId: 'call_one',
                toolName: 'bash',
                type: 'tool-result',
            },
            { id: 'think_1', startedAt: '2026-08-11T00:00:04.000Z', type: 'reasoning-start' },
            { id: 'think_1', text: 'weigh the options', truncated: true, type: 'reasoning-append' },
            { endedAt: '2026-08-11T00:00:05.000Z', id: 'think_1', type: 'reasoning-end' },
            {
                occurredAt: '2026-08-11T00:00:06.000Z',
                toolCallId: 'call_two',
                toolName: 'read',
                type: 'tool-call',
            },
            {
                at: '2026-08-11T00:00:07.000Z',
                reason: 'stream_abort',
                status: 'interrupted',
                type: 'interrupt',
            },
            { at: '2026-08-11T00:00:08.000Z', status: 'interrupted', type: 'finish' },
        ])
    );

    expect(document?.status).toBe('interrupted');
    expect(document?.endedAt).toBe('2026-08-11T00:00:08.000Z');
    expect(document?.tools[0]).toMatchObject({
        durationMs: 2000,
        error: 'boom',
        final: { error: 'boom' },
        nativeName: 'bash',
        preliminary: { output: 'partial' },
        status: 'failed',
    });
    expect(document?.tools[1]).toMatchObject({
        interruptions: [{ at: '2026-08-11T00:00:07.000Z', reason: 'stream_abort' }],
        status: 'interrupted',
    });
    expect(document?.reasoning?.[0]).toEqual({
        endedAt: '2026-08-11T00:00:05.000Z',
        id: 'think_1',
        startedAt: '2026-08-11T00:00:04.000Z',
        text: 'weigh the options',
        truncated: true,
    });
});

test('ignores a torn trailing record and refuses a corrupt one mid-log', () => {
    const complete = lines([
        openRecord,
        {
            occurredAt: '2026-08-11T00:00:01.000Z',
            toolCallId: 'call_one',
            toolName: 'bash',
            type: 'tool-call',
        },
    ]);
    const torn = [...complete.slice(0, -1), '{"type":"tool-call","toolCa'];

    expect(replayJournalRecords(torn)?.tools).toHaveLength(1);
    expect(() => replayJournalRecords([...torn, JSON.stringify(openRecord), ''])).toThrow(
        'corrupt record'
    );
});

test('a live turn appends records instead of rewriting the whole document', async () => {
    const agentRoot = await root('haus-journal-append-');
    const journal = await createComputerExecutionJournal({ agentRoot, runId: 'run_append' });

    for (let index = 0; index < 5; index += 1) {
        const toolCallId = `call_${String(index)}`;
        await journal.recordToolCall({ input: { command: 'ls' }, toolCallId, toolName: 'bash' });
        await journal.recordToolResult({
            isError: false,
            output: { stdout: 'x'.repeat(1000) },
            preliminary: false,
            toolCallId,
            toolName: 'bash',
        });
    }
    journal.recordReasoningStart({ id: 'think_1' });
    journal.appendReasoning({ id: 'think_1', text: 'one ' });
    journal.appendReasoning({ id: 'think_1', text: 'thought' });
    await journal.flushReasoning();

    const logLines = await readLogLines(agentRoot, 'run_append');
    const reasoningAppends = logLines.filter((line) => line.includes('"reasoning-append"'));
    expect(reasoningAppends).toHaveLength(1);
    expect(reasoningAppends[0]).toContain('one thought');
    expect(replayJournalRecords(logLines)).toEqual(journal.snapshot());
    expect(await readComputerExecutionJournal(agentRoot, 'run_append')).toEqual(journal.snapshot());
});

test('finishing writes one snapshot and drops the log', async () => {
    const agentRoot = await root('haus-journal-snapshot-');
    const journal = await createComputerExecutionJournal({ agentRoot, runId: 'run_snapshot' });
    await journal.recordToolCall({ toolCallId: 'call_done', toolName: 'bash' });
    await journal.recordToolResult({
        isError: false,
        output: 'ok',
        preliminary: false,
        toolCallId: 'call_done',
        toolName: 'bash',
    });
    await journal.finish('completed');

    const snapshot = JSON.parse(
        await readFile(executionJournalPath(agentRoot, 'run_snapshot'), 'utf8')
    ) as ExecutionJournalDocument;
    expect(snapshot).toEqual(journal.snapshot());
    expect(snapshot.status).toBe('completed');
    await expect(readFile(logPath(agentRoot, 'run_snapshot'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
    });
});

test('recovers a turn a crash left mid-flight and marks its pending tools interrupted', async () => {
    const agentRoot = await root('haus-journal-crash-');
    const crashed = await createComputerExecutionJournal({ agentRoot, runId: 'run_crash' });
    await crashed.recordToolCall({
        input: { command: 'sleep 100' },
        toolCallId: 'call_pending',
        toolName: 'bash',
    });

    const running = await readComputerExecutionJournal(agentRoot, 'run_crash');
    expect(running).toMatchObject({ status: 'running' });
    expect(running?.tools[0]).toMatchObject({ input: { command: 'sleep 100' }, status: 'running' });

    const reopened = await createComputerExecutionJournal({ agentRoot, runId: 'run_crash' });
    expect(reopened.snapshot().tools[0]).toMatchObject({
        interruptions: [{ reason: 'computer_restart' }],
        status: 'interrupted',
    });
    await reopened.finish('completed');
    expect((await readComputerExecutionJournal(agentRoot, 'run_crash'))?.tools[0]).toMatchObject({
        interruptions: [{ reason: 'computer_restart' }],
        status: 'interrupted',
    });
});

test('prefers the settled snapshot over a log the same run left behind', async () => {
    const agentRoot = await root('haus-journal-prefer-');
    const journal = await createComputerExecutionJournal({ agentRoot, runId: 'run_prefer' });
    await journal.finish('completed');
    await writeFile(logPath(agentRoot, 'run_prefer'), `${JSON.stringify(openRecord)}\n`, 'utf8');

    expect(await readComputerExecutionJournal(agentRoot, 'run_prefer')).toMatchObject({
        runId: 'run_prefer',
        status: 'completed',
    });
});

test('caps every string leaf so a huge nested payload keeps its shape', async () => {
    const agentRoot = await root('haus-journal-cap-');
    const journal = await createComputerExecutionJournal({ agentRoot, runId: 'run_cap' });
    const huge = 'x'.repeat(EXECUTION_JOURNAL_VALUE_MAX_CHARS + 25);
    await journal.recordToolResult({
        isError: false,
        output: { nested: [{ stderr: huge }], stdout: huge },
        preliminary: false,
        toolCallId: 'call_big',
        toolName: 'bash',
    });
    await journal.finish('completed');

    const document = await readComputerExecutionJournal(agentRoot, 'run_cap');
    const output = document?.tools[0]?.output as {
        nested: Array<{ stderr: string }>;
        stdout: string;
    };
    expect(output.stdout).toHaveLength(EXECUTION_JOURNAL_VALUE_MAX_CHARS + 32);
    expect(output.stdout.endsWith('\n…[truncated 25 more characters]')).toBe(true);
    expect(output.nested[0]?.stderr).toBe(output.stdout);
});

test('the upload sink hears the open and each batch only after it is on disk', async () => {
    const agentRoot = await root('haus-journal-sink-');
    const heard: Array<{ lastLogged: string; types: string[] }> = [];
    const journal = await createComputerExecutionJournal(
        { agentRoot, runId: 'run_sink' },
        {
            written: (records) => {
                const logged = readFileSync(logPath(agentRoot, 'run_sink'), 'utf8')
                    .split('\n')
                    .filter((line) => line.length > 0);
                heard.push({
                    lastLogged: (JSON.parse(logged.at(-1) ?? '{}') as JournalRecord).type,
                    types: records.map((record) => record.type),
                });
            },
        }
    );
    journal.recordReasoningStart({ id: 'thought' });
    journal.appendReasoning({ id: 'thought', text: 'Checking the queue.' });
    expect(heard).toHaveLength(1);
    await journal.flushReasoning();
    await journal.flushReasoning();
    await journal.recordToolCall({ toolCallId: 'call_1', toolName: 'bash' });
    await journal.finish('completed');
    expect(heard).toEqual([
        { lastLogged: 'open', types: ['open'] },
        { lastLogged: 'reasoning-append', types: ['reasoning-start', 'reasoning-append'] },
        { lastLogged: 'tool-call', types: ['tool-call'] },
        { lastLogged: 'finish', types: ['finish'] },
    ]);
});
