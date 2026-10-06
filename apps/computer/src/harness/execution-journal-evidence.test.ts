import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
    EXECUTION_JOURNAL_REASONING_MAX_BLOCKS,
    EXECUTION_JOURNAL_REASONING_MAX_CHARS,
} from '@haus/api';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createComputerActivityProjector } from './activity-projector.ts';
import { createComputerActivityRegistry } from './activity-registry.ts';
import {
    createComputerExecutionJournal,
    executionJournalPath,
    readComputerExecutionJournal,
} from './execution-journal.ts';

const roots: string[] = [];
const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function harness(runId: string) {
    const root = await mkdtemp(join(tmpdir(), 'haus-journal-evidence-'));
    roots.push(root);
    const journal = await createComputerExecutionJournal({ agentRoot: root, runId });
    const events: Array<{ category: string; phase: string }> = [];
    const projector = createComputerActivityProjector({
        journal,
        activity: new AgentActivityRun(runtime, ({ category, phase }) =>
            events.push({ category, phase })
        ),
        registry: createComputerActivityRegistry(),
        runtimeId: 'claude-code',
    });
    return { events, journal, projector, root };
}

test('records the real tool output the translated stream carries on `output`', async () => {
    const { events, projector, root } = await harness('run_output');

    await projector.observe({
        input: { command: 'echo hi' },
        toolCallId: 'call_output',
        toolName: 'bash',
        type: 'tool-call',
    });
    await projector.observe({
        output: { exitCode: 0, stdout: 'hi\n' },
        toolCallId: 'call_output',
        toolName: 'bash',
        type: 'tool-result',
    });

    const document = await readComputerExecutionJournal(root, 'run_output');
    expect(document?.tools[0]?.output).toEqual({ exitCode: 0, stdout: 'hi\n' });
    expect(document?.tools[0]?.final?.output).toEqual(document?.tools[0]?.output);
    expect(document?.tools[0]?.status).toBe('completed');
    expect(events).toContainEqual({ category: 'running_command', phase: 'completed' });
});

test('keeps the real failure a `tool-error` reports instead of a synthetic stream error', async () => {
    const { events, projector, root } = await harness('run_error');

    await projector.observe({
        input: { file_path: '/missing.txt' },
        toolCallId: 'call_error',
        toolName: 'read',
        type: 'tool-call',
    });
    await projector.observe({
        error: new Error('ENOENT: no such file'),
        input: { file_path: '/missing.txt' },
        toolCallId: 'call_error',
        toolName: 'read',
        type: 'tool-error',
    });
    await projector.finish('completed');

    const document = await readComputerExecutionJournal(root, 'run_error');
    expect(document?.tools[0]).toMatchObject({
        error: { message: 'ENOENT: no such file', name: 'Error' },
        final: { error: { message: 'ENOENT: no such file', name: 'Error' } },
        status: 'failed',
    });
    expect(JSON.stringify(document)).not.toContain('stream_failed');
    expect(events).toContainEqual({ category: 'reading_files', phase: 'failed' });
});

test('captures reasoning blocks with timestamps and flushes them at tool boundaries', async () => {
    const { journal, projector, root } = await harness('run_reasoning');

    await projector.observe({ id: 'think_1', type: 'reasoning-start' });
    await projector.observe({ id: 'think_1', text: 'weigh ', type: 'reasoning-delta' });
    await projector.observe({ id: 'think_1', text: 'the options', type: 'reasoning-delta' });
    await projector.observe({ id: 'think_1', type: 'reasoning-end' });

    const document = await readComputerExecutionJournal(root, 'run_reasoning');
    expect(document?.reasoning).toHaveLength(1);
    expect(document?.reasoning?.[0]).toMatchObject({ id: 'think_1', text: 'weigh the options' });
    expect(Date.parse(document?.reasoning?.[0]?.endedAt ?? '')).toBeGreaterThanOrEqual(
        Date.parse(document?.reasoning?.[0]?.startedAt ?? '')
    );
    expect(journal.snapshot().reasoning?.[0]?.truncated).toBeUndefined();
});

test('stops appending reasoning past the cap and marks the block truncated', async () => {
    const { projector, root } = await harness('run_truncated');

    await projector.observe({ id: 'think_big', type: 'reasoning-start' });
    await projector.observe({
        id: 'think_big',
        text: 'a'.repeat(EXECUTION_JOURNAL_REASONING_MAX_CHARS - 1),
        type: 'reasoning-delta',
    });
    await projector.observe({ id: 'think_big', text: 'bcd', type: 'reasoning-delta' });
    await projector.observe({ id: 'think_big', type: 'reasoning-end' });

    const document = await readComputerExecutionJournal(root, 'run_truncated');
    expect(document?.reasoning?.[0]?.text).toHaveLength(EXECUTION_JOURNAL_REASONING_MAX_CHARS);
    expect(document?.reasoning?.[0]?.text.endsWith('ab')).toBe(true);
    expect(document?.reasoning?.[0]?.truncated).toBe(true);
});

test('stops opening reasoning blocks at the contract ceiling', async () => {
    const { journal } = await harness('run_many_blocks');

    for (let index = 0; index < EXECUTION_JOURNAL_REASONING_MAX_BLOCKS + 5; index += 1) {
        journal.recordReasoningStart({ id: `think_${String(index)}` });
        journal.appendReasoning({ id: `think_${String(index)}`, text: 'thought' });
    }
    await journal.flushReasoning();

    const blocks = journal.snapshot().reasoning ?? [];
    expect(blocks).toHaveLength(EXECUTION_JOURNAL_REASONING_MAX_BLOCKS);
    expect(blocks.at(-1)?.id).toBe(`think_${String(EXECUTION_JOURNAL_REASONING_MAX_BLOCKS - 1)}`);
});

test('persists partial reasoning when the turn is interrupted mid-block', async () => {
    const { projector, root } = await harness('run_interrupted');

    await projector.observe({ id: 'think_partial', type: 'reasoning-start' });
    await projector.observe({
        id: 'think_partial',
        text: 'half a thought',
        type: 'reasoning-delta',
    });
    await projector.finish('interrupted');

    const document = await readComputerExecutionJournal(root, 'run_interrupted');
    expect(document?.reasoning?.[0]).toMatchObject({
        id: 'think_partial',
        text: 'half a thought',
    });
    expect(document?.reasoning?.[0]?.endedAt).toBeUndefined();
});

test('reads journals written before reasoning capture existed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-journal-legacy-'));
    roots.push(root);
    const path = executionJournalPath(root, 'run_legacy');
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    await writeFile(
        path,
        JSON.stringify({
            runId: 'run_legacy',
            startedAt: '2026-08-11T00:00:00.000Z',
            status: 'completed',
            tools: [
                {
                    startedAt: '2026-08-11T00:00:00.000Z',
                    status: 'completed',
                    toolCallId: 'call_legacy',
                    toolName: 'bash',
                },
            ],
        }),
        'utf8'
    );

    const document = await readComputerExecutionJournal(root, 'run_legacy');
    expect(document?.tools).toHaveLength(1);
    expect(document?.reasoning).toBeUndefined();

    const journal = await createComputerExecutionJournal({ agentRoot: root, runId: 'run_legacy' });
    journal.recordReasoningStart({ id: 'think_new' });
    journal.appendReasoning({ id: 'think_new', text: 'resumed' });
    await journal.flushReasoning();
    expect((await readComputerExecutionJournal(root, 'run_legacy'))?.reasoning?.[0]?.text).toBe(
        'resumed'
    );
});

test('projects synthetic harness file changes as edits and keeps compaction out of activity', async () => {
    const { events, projector, root } = await harness('run_synthetic');

    await projector.observe({
        dynamic: true,
        input: { event: 'modify', path: 'apps/computer/src/index.ts' },
        providerExecuted: true,
        toolCallId: 'call_file_change',
        toolName: 'fileChange',
        type: 'tool-call',
    });
    await projector.observe({
        dynamic: true,
        output: { event: 'modify', path: 'apps/computer/src/index.ts' },
        providerExecuted: true,
        toolCallId: 'call_file_change',
        toolName: 'fileChange',
        type: 'tool-result',
    });
    await projector.observe({
        dynamic: true,
        input: {},
        providerExecuted: true,
        toolCallId: 'call_compaction',
        toolName: 'compaction',
        type: 'tool-call',
    });
    await projector.observe({
        dynamic: true,
        output: { summary: 'condensed', tokensAfter: 20, tokensBefore: 100, trigger: 'auto' },
        providerExecuted: true,
        toolCallId: 'call_compaction',
        toolName: 'compaction',
        type: 'tool-result',
    });
    await projector.finish('completed');

    expect(events).toEqual([
        { category: 'editing_files', phase: 'started' },
        { category: 'editing_files', phase: 'completed' },
    ]);
    const document = await readComputerExecutionJournal(root, 'run_synthetic');
    expect(document?.tools.map((tool) => tool.toolName)).toEqual(['fileChange', 'compaction']);
    expect(document?.tools[1]).toMatchObject({
        output: { summary: 'condensed', trigger: 'auto' },
        status: 'completed',
    });
});

test('keeps an MCP-style fileChange the harness did not execute generic', async () => {
    const { events, projector } = await harness('run_impostor');

    await projector.observe({
        dynamic: true,
        input: { event: 'delete', path: '/etc/passwd' },
        toolCallId: 'call_impostor',
        toolName: 'fileChange',
        type: 'tool-call',
    });
    await projector.observe({
        dynamic: true,
        output: 'done',
        toolCallId: 'call_impostor',
        toolName: 'fileChange',
        type: 'tool-result',
    });

    expect(events).toEqual([
        { category: 'using_tool', phase: 'started' },
        { category: 'using_tool', phase: 'completed' },
    ]);
});
