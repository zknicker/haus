import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournal, AgentExecutionJournalTool } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTracePresentation } from './turn-trace.tsx';
import { traceKindFill, traceKindText, traceToolKind } from './turn-trace-kind.ts';
import { barTone } from './turn-trace-track.tsx';

test('each tool kind maps to one trace kind, files and search sharing the file hue', () => {
    assert.equal(traceToolKind('shell'), 'shell');
    for (const kind of ['file-read', 'file-edit', 'file-write', 'file-change', 'search'] as const) {
        assert.equal(traceToolKind(kind), 'file');
    }
    assert.equal(traceToolKind('web'), 'web');
    assert.equal(traceToolKind('subagent'), 'subagent');
    assert.equal(traceToolKind('image'), 'media');
    assert.equal(traceToolKind('mcp'), 'tool');
    assert.equal(traceToolKind('generic'), 'tool');
    assert.equal(traceToolKind('message'), 'haus');
    assert.equal(traceToolKind('compaction'), 'haus');
});

test('a kind paints its bar and icon from its own token; Haus stays muted', () => {
    assert.equal(traceKindFill.shell, 'bg-trace-shell');
    assert.equal(traceKindText.shell, 'text-trace-shell');
    assert.equal(traceKindFill.haus, 'bg-trace-quiet');
    assert.equal(traceKindText.haus, 'text-muted');
    assert.equal(barTone({ kind: 'thinking', status: 'completed' }), 'bg-trace-thinking');
    // An outcome overrides the kind's hue.
    assert.equal(barTone({ kind: 'shell', status: 'failed' }), 'bg-danger');
    assert.equal(barTone({ kind: 'subagent', status: 'warning' }), 'bg-warning');
    assert.equal(barTone({ kind: 'web', status: 'interrupted' }), 'bg-trace-quiet');
});

test('a row colors its icon and bar by kind and keeps its label neutral', () => {
    const markup = render({
        reasoning: [{ endedAt: at(2), id: 'r', startedAt: at(1), text: '**Weighing**\n\nDu.' }],
        tools: [
            tool({ input: { command: 'bun test' }, toolCallId: 'call-shell' }),
            tool({
                input: { url: 'https://example.com' },
                toolCallId: 'call-web',
                toolName: 'web_fetch',
            }),
        ],
    });
    for (const kind of ['thinking', 'shell', 'web']) {
        assert.match(markup, new RegExp(`text-trace-${kind}`));
        assert.match(markup, new RegExp(`bg-trace-${kind}`));
        assert.match(markup, new RegExp(`data-trace-bar="${kind}"`));
    }
    assert.doesNotMatch(markup, /<span class="[^"]*text-trace-[^"]*"[^>]*>[A-Z]/);
});

test('a lone Haus bookkeeping call keeps the muted Haus mark and bar', () => {
    const markup = render({
        tools: [tool({ input: { command: 'haus task done tsk_1' }, toolCallId: 'call-haus' })],
    });
    assert.match(markup, /data-trace-bar="haus"/);
    assert.match(markup, /size-3\.5 shrink-0 text-muted/);
    assert.doesNotMatch(markup, /text-trace-shell/);
});

function render(overrides: Partial<AgentExecutionJournal>) {
    return renderToStaticMarkup(
        <TurnTracePresentation
            access="journal"
            isPending={false}
            presentation={{
                journal: {
                    runId: 'run_1',
                    startedAt: at(0),
                    status: 'completed',
                    tools: [],
                    ...overrides,
                },
                kind: 'available',
            }}
        />
    );
}

function at(seconds: number) {
    return new Date(Date.UTC(2026, 2, 31, 15, 0, seconds)).toISOString();
}

function tool(overrides: Partial<AgentExecutionJournalTool>): AgentExecutionJournalTool {
    return {
        endedAt: at(4),
        startedAt: at(3),
        status: 'completed',
        toolCallId: 'call-1',
        toolName: 'bash',
        ...overrides,
    };
}
