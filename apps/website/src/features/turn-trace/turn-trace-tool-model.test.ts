import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournalTool } from '@haus/api';
import {
    classifyTraceTool,
    resolveToolPartState,
    resolveTraceError,
    resolveTraceOutput,
    resolveTracePreliminary,
} from './turn-trace-tool-model.ts';
import { readTraceSources } from './turn-trace-values.ts';

function at(seconds: number) {
    return new Date(Date.UTC(2026, 2, 31, 15, 0, seconds)).toISOString();
}

function tool(overrides: Partial<AgentExecutionJournalTool> = {}): AgentExecutionJournalTool {
    return {
        startedAt: at(1),
        status: 'completed',
        toolCallId: 'call-1',
        toolName: 'bash',
        ...overrides,
    };
}

test('classifyTraceTool reads each runtime tool shape into typed fields', () => {
    const shell = classifyTraceTool(tool({ input: { command: 'bun test' }, toolName: 'bash' }));
    const write = classifyTraceTool(
        tool({ input: { content: 'x', file_path: 'apps/x.ts' }, toolName: 'write' })
    );
    const edit = classifyTraceTool(
        tool({
            input: {
                file_path: 'apps/y.ts',
                new_string: 'after',
                old_string: 'before',
                replace_all: true,
            },
            toolName: 'edit',
        })
    );
    const read = classifyTraceTool(tool({ input: { file_path: 'apps/z.ts' }, toolName: 'read' }));
    const glob = classifyTraceTool(tool({ input: { pattern: '**/*.ts' }, toolName: 'glob' }));
    const grep = classifyTraceTool(
        tool({ input: { path: 'apps', pattern: 'todo' }, toolName: 'grep' })
    );
    const search = classifyTraceTool(
        tool({ input: { query: 'haus docs' }, toolName: 'webSearch' })
    );
    const fetched = classifyTraceTool(
        tool({
            input: { prompt: 'summarize', url: 'https://example.com/docs' },
            toolName: 'WebFetch',
        })
    );
    const mcp = classifyTraceTool(
        tool({ input: { term: 'mug' }, toolName: 'mcp__merchbase__products_search_a1b2c3d4' })
    );
    const other = classifyTraceTool(tool({ toolName: 'listMcpResources' }));

    assert.equal(shell.kind, 'shell');
    assert.equal(shell.label, 'Ran bun test');
    assert.equal(write.kind, 'file-write');
    assert.equal(write.label, 'Wrote x.ts');
    assert.deepEqual(write.target, { dir: 'apps', name: 'x.ts', path: 'apps/x.ts' });
    assert.equal(edit.kind, 'file-edit');
    assert.equal(edit.oldText, 'before');
    assert.equal(edit.newText, 'after');
    assert.equal(edit.replaceAll, true);
    assert.equal(read.kind, 'file-read');
    assert.equal(glob.kind, 'search');
    assert.equal(glob.pattern, '**/*.ts');
    assert.equal(grep.kind, 'search');
    assert.equal(grep.path, 'apps');
    assert.equal(search.kind, 'web');
    assert.equal(search.query, 'haus docs');
    assert.equal(fetched.kind, 'web');
    assert.equal(fetched.label, 'Fetched example.com');
    assert.equal(mcp.kind, 'mcp');
    assert.equal(mcp.connection, 'merchbase');
    assert.equal(mcp.remoteTool, 'products_search');
    assert.equal(mcp.label, 'Called merchbase · products_search');
    assert.equal(other.kind, 'generic');
    assert.equal(other.label, 'Used listMcpResources');
});

test('classifyTraceTool names the harness-synthesized runtime events', () => {
    const changed = classifyTraceTool(
        tool({ input: { event: 'modify', path: 'apps/x.ts' }, toolName: 'fileChange' })
    );
    const created = classifyTraceTool(
        tool({ input: { event: 'create', path: 'apps/y.ts' }, toolName: 'fileChange' })
    );
    const deleted = classifyTraceTool(
        tool({ input: { event: 'delete', path: 'apps/z.ts' }, toolName: 'fileChange' })
    );
    const compaction = classifyTraceTool(
        tool({
            input: {},
            output: { summary: 'condensed', tokensAfter: 20, tokensBefore: 100, trigger: 'auto' },
            toolName: 'compaction',
        })
    );

    assert.equal(changed.kind, 'file-change');
    assert.equal(changed.label, 'Modified x.ts');
    assert.equal(created.label, 'Created y.ts');
    assert.equal(deleted.label, 'Deleted z.ts');
    assert.equal(compaction.kind, 'compaction');
    assert.equal(compaction.label, 'Compacted the context');
});

test('resolveToolPartState maps journal status onto the tool card state', () => {
    assert.equal(resolveToolPartState(tool({ status: 'running' })), 'input-available');
    assert.equal(resolveToolPartState(tool({ status: 'completed' })), 'output-available');
    assert.equal(resolveToolPartState(tool({ status: 'failed' })), 'output-error');
    assert.equal(resolveToolPartState(tool({ status: 'interrupted' })), 'output-available');
});

test('classifyTraceTool explains why an interrupted call stopped', () => {
    const interrupted = classifyTraceTool(
        tool({
            interruptions: [{ at: at(3), reason: 'computer_restart' }],
            status: 'interrupted',
            toolName: 'bash',
        })
    );

    assert.equal(interrupted.state, 'output-available');
    assert.equal(interrupted.interrupted, true);
    assert.match(interrupted.interruption ?? '', /Computer restarted/);
    assert.equal(
        classifyTraceTool(tool({ status: 'interrupted', toolName: 'bash' })).interruption,
        'The call stopped before it finished.'
    );
    assert.equal(classifyTraceTool(tool({ status: 'failed' })).interrupted, false);
});

test('trace output prefers the live value and keeps only distinct preliminaries', () => {
    const relayed = tool({ final: { observedAt: at(2), output: 'done' }, output: undefined });
    const settled = tool({ final: { observedAt: at(2), output: 'done' }, output: 'done' });
    const partial = tool({
        final: { observedAt: at(2), output: 'done' },
        output: 'done',
        preliminary: { observedAt: at(1), output: 'partial' },
    });
    const duplicate = tool({
        output: 'done',
        preliminary: { observedAt: at(1), output: 'done' },
    });

    assert.equal(resolveTraceOutput(relayed), 'done');
    assert.equal(resolveTraceOutput(settled), 'done');
    assert.equal(resolveTracePreliminary(partial), 'partial');
    assert.equal(resolveTracePreliminary(duplicate), undefined);
    assert.equal(resolveTraceError(tool({ final: { error: 'boom', observedAt: at(2) } })), 'boom');
});

test('readTraceSources lifts cited URLs out of a web result', () => {
    assert.deepEqual(
        readTraceSources({
            results: [{ title: 'Haus', url: 'https://haus.dev' }, { snippet: 'no url' }],
        }),
        [{ title: 'Haus', url: 'https://haus.dev' }]
    );
});

test('a running call reads in the present tense; it settles into the past', () => {
    const running = classifyTraceTool(
        tool({ input: { file_path: 'src/a.ts' }, status: 'running', toolName: 'read' })
    );
    assert.equal(running.label, 'Reading a.ts');
    assert.equal(running.status, 'running');
    assert.deepEqual(running.labels, { past: 'Read a.ts', present: 'Reading a.ts' });
});

test('MEMORY.md upkeep and all-haus commands are bookkeeping; real work is not', () => {
    const memory = classifyTraceTool(tool({ input: { path: 'MEMORY.md' }, toolName: 'read' }));
    const nested = classifyTraceTool(tool({ input: { path: 'docs/MEMORY.md' }, toolName: 'read' }));
    const claim = classifyTraceTool(tool({ input: { command: 'haus task claim --number 1' } }));
    const mixed = classifyTraceTool(tool({ input: { command: 'haus task claim && bun test' } }));
    assert.equal(memory.isBookkeeping, true);
    assert.equal(nested.isBookkeeping, false);
    assert.equal(claim.isBookkeeping, true);
    assert.equal(mixed.isBookkeeping, false);
    assert.equal(mixed.label, 'Ran bun test');
});

test('a failed call carries a readable failure; an interrupted one does not', () => {
    const failed = classifyTraceTool(
        tool({ error: { exit_code: 1, formatted_output: 'nope\n' }, input: {}, status: 'failed' })
    );
    assert.deepEqual(failed.failure, { exitCode: 1, message: 'nope' });
    assert.equal(classifyTraceTool(tool({ status: 'interrupted' })).failure, null);
});

test('a sub-agent with a failed child warns, preferring the Computer count', () => {
    const child = classifyTraceTool(tool({ status: 'failed', toolCallId: 'c', toolName: 'Glob' }));
    const subagent = { label: 'Audit', startedAt: at(1), status: 'completed' as const };
    const derived = classifyTraceTool(tool({ subagent, toolName: 'Agent' }), [child]);
    const reported = classifyTraceTool(
        tool({ subagent: { ...subagent, failedToolCount: 4 }, toolName: 'Agent' }),
        [child]
    );
    assert.equal(derived.status, 'warning');
    assert.equal(derived.failedChildCount, 1);
    assert.equal(reported.failedChildCount, 4);
});
