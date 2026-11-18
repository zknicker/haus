import { expect, test } from 'bun:test';
import {
    agentCommandSchema,
    agentExecutionJournalRecordsFrameSchema,
    agentExecutionJournalSchema,
    type ExecutionJournalUploadRecord,
    parseExecutionJournalUploadRecord,
    presentExecutionJournal,
    replayExecutionJournalUpload,
} from './index.ts';

const at = (second: number) => `2026-10-14T12:00:${String(second).padStart(2, '0')}.000Z`;

const opened: ExecutionJournalUploadRecord = {
    document: { runId: 'run_1', startedAt: at(0), status: 'running', tools: [] },
    type: 'open',
};

test('replays a chunked open, its parts, and later mutations into the served journal', () => {
    const records: ExecutionJournalUploadRecord[] = [
        opened,
        {
            tool: {
                startedAt: at(1),
                status: 'running',
                toolCallId: 'call_agent',
                toolName: 'Agent',
            },
            type: 'tool',
        },
        { block: { id: 'think_1', startedAt: at(1), text: 'Plan.' }, type: 'reasoning' },
        {
            occurredAt: at(2),
            patch: { label: 'Review', status: 'running' },
            toolCallId: 'call_agent',
            type: 'subagent',
        },
        {
            input: { command: 'ls missing' },
            occurredAt: at(3),
            parentToolCallId: 'call_agent',
            toolCallId: 'call_ls',
            toolName: 'bash',
            type: 'tool-call',
        },
        {
            isError: true,
            occurredAt: at(4),
            output: 'Exit code 2\nls: missing: No such file',
            preliminary: false,
            toolCallId: 'call_ls',
            toolName: 'bash',
            type: 'tool-result',
        },
        { at: at(5), status: 'completed', type: 'finish' },
    ];
    const document = replayExecutionJournalUpload(records);
    expect(document).not.toBeNull();
    const journal = agentExecutionJournalSchema.parse(presentExecutionJournal(document!));
    expect(journal).toMatchObject({ endedAt: at(5), status: 'completed' });
    expect(journal.reasoning).toEqual([{ id: 'think_1', startedAt: at(1), text: 'Plan.' }]);
    expect(journal.tools.map((tool) => [tool.toolCallId, tool.status])).toEqual([
        ['call_agent', 'failed'],
        ['call_ls', 'failed'],
    ]);
    expect(journal.tools[1]?.failure).toEqual({
        exitCode: 2,
        message: 'ls: missing: No such file',
    });
    expect(journal.tools[0]?.subagent).toMatchObject({
        failedToolCount: 1,
        label: 'Review',
        status: 'interrupted',
    });
});

test('the latest open replaces every record before it', () => {
    const resumed: ExecutionJournalUploadRecord = {
        document: { runId: 'run_1', startedAt: at(0), status: 'running', tools: [] },
        type: 'open',
    };
    const document = replayExecutionJournalUpload([
        opened,
        { occurredAt: at(1), toolCallId: 'call_old', toolName: 'bash', type: 'tool-call' },
        resumed,
        { occurredAt: at(2), toolCallId: 'call_new', toolName: 'bash', type: 'tool-call' },
    ]);
    expect(document?.tools.map((tool) => tool.toolCallId)).toEqual(['call_new']);
    expect(
        replayExecutionJournalUpload([
            { occurredAt: at(1), toolCallId: 'call', toolName: 'bash', type: 'tool-call' },
        ])
    ).toBeNull();
});

test('refuses malformed records one at a time and keeps the frame envelope loose', () => {
    expect(
        parseExecutionJournalUploadRecord({ occurredAt: 'yesterday', type: 'tool-call' })
    ).toBeNull();
    expect(parseExecutionJournalUploadRecord({ text: 'x', type: 'reasoning-append' })).toBeNull();
    expect(parseExecutionJournalUploadRecord(opened)).toEqual(opened);
    const frame = agentExecutionJournalRecordsFrameSchema.parse({
        agentId: 'agt_1',
        records: [{ record: { anything: true }, sequence: 7 }],
        runId: 'run_1',
        runStartedAt: at(0),
        type: 'agent-execution-journal-records',
    });
    expect(frame.records[0]?.sequence).toBe(7);
    expect(
        agentExecutionJournalRecordsFrameSchema.safeParse({ ...frame, records: [] }).success
    ).toBe(false);
});

test('the ack rides the Server-to-Computer command union', () => {
    expect(
        agentCommandSchema.parse({
            agentId: 'agt_1',
            runId: 'run_1',
            status: 'stored',
            throughSequence: 7,
            type: 'agent-execution-journal-ack',
        }).type
    ).toBe('agent-execution-journal-ack');
});
