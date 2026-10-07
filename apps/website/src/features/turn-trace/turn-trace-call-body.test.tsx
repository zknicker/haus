import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentExecutionJournalTool } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { TurnTraceCallBody } from './turn-trace-call-body.tsx';
import { classifyTraceTool } from './turn-trace-tool-model.ts';
import { traceTextMaxChars } from './turn-trace-values.ts';

test('each tool kind opens to tool kind with its own evidence', () => {
    const markup = renderBodies([
        tool({
            input: { command: 'bun test' },
            output: 'ok',
            toolCallId: 'call-shell',
            toolName: 'bash',
        }),
        tool({
            input: { content: 'export const x = 1;', file_path: 'apps/website/src/x.ts' },
            toolCallId: 'call-write',
            toolName: 'write',
        }),
        tool({
            input: {
                file_path: 'apps/website/src/y.ts',
                new_string: 'const after = 2;',
                old_string: 'const before = 1;',
            },
            toolCallId: 'call-edit',
            toolName: 'edit',
        }),
        tool({
            input: { term: 'mug' },
            toolCallId: 'call-mcp',
            toolName: 'mcp__merchbase__products_search_a1b2c3d4',
        }),
    ]);

    assert.match(markup, /bun test/);
    assert.match(markup, /apps\/website\/src\/x\.ts/);
    assert.match(markup, /apps\/website\/src\/y\.ts/);
    assert.match(markup, /const before = 1;/);
    assert.match(markup, /const after = 2;/);
    assert.match(markup, /merchbase/);
    assert.match(markup, /products_search/);
});

test('a call states what the runtime changed and compacted, not raw arguments', () => {
    const markup = renderBodies([
        tool({
            input: { event: 'modify', path: 'apps/computer/src/index.ts' },
            output: { event: 'modify', path: 'apps/computer/src/index.ts' },
            toolCallId: 'call-file-change',
            toolName: 'fileChange',
        }),
        tool({
            input: {},
            output: {
                summary: 'Condensed the earlier turns.',
                tokensAfter: 20_000,
                tokensBefore: 140_000,
                trigger: 'auto',
            },
            toolCallId: 'call-compaction',
            toolName: 'compaction',
        }),
    ]);

    assert.match(markup, /Modified index\.ts/);
    assert.match(markup, /Compacted the context/);
    assert.match(markup, /Condensed the earlier turns\./);
    assert.doesNotMatch(markup, /Used compaction/);
    assert.doesNotMatch(markup, /Used fileChange/);
});

test('a call shows the evidence codex-acp journals for a command, an edit, and a read', () => {
    const markup = renderBodies([
        tool({
            endedAt: at(1),
            input: { command: 'date', cwd: '<workspace>' },
            output: { exit_code: 0, formatted_output: 'Wed Sep 23 13:47:04 EDT 2026\n' },
            toolCallId: 'call-date',
        }),
        tool({
            input: { command: 'false' },
            output: { exit_code: 2, formatted_output: 'boom\n' },
            toolCallId: 'call-false',
        }),
        tool({
            input: { event: 'create', path: 'probe-notes.txt' },
            nativeName: 'apply_patch',
            output: [
                {
                    newText: 'alpha\n',
                    oldText: null,
                    path: 'probe-notes.txt',
                    type: 'diff',
                },
            ],
            toolCallId: 'call-create',
            toolName: 'fileChange',
        }),
        tool({
            input: { event: 'modify', path: 'notes.md' },
            output: [
                {
                    newText: 'after line\n',
                    oldText: 'before line\n',
                    path: 'notes.md',
                    type: 'diff',
                },
            ],
            toolCallId: 'call-modify',
            toolName: 'fileChange',
        }),
        tool({
            input: { path: 'probe-notes.txt' },
            nativeName: 'bash',
            output: { exit_code: 0, formatted_output: 'read-back text\n' },
            toolCallId: 'call-read',
            toolName: 'read',
        }),
    ]);

    assert.match(markup, /Wed Sep 23 13:47:04 EDT 2026/);
    // Only a failing command states its exit code.
    assert.equal(markup.match(/>Exit code</g)?.length, 1);
    assert.match(markup, /boom/);
    // A step whose start and end arrived together claims no duration.
    assert.doesNotMatch(markup, />0ms</);
    assert.match(markup, /Created probe-notes\.txt/);
    assert.match(markup, /alpha/);
    assert.match(markup, /Modified notes\.md/);
    assert.match(markup, /before line/);
    assert.match(markup, /after line/);
    assert.match(markup, /Read probe-notes\.txt/);
    assert.match(markup, /read-back text/);
});

test('a call body bounds a single unbroken line of tool output', () => {
    const markup = renderBodies([
        tool({
            input: { command: 'cat huge.log' },
            output: 'x'.repeat(traceTextMaxChars * 2),
            toolCallId: 'call-huge',
            toolName: 'bash',
        }),
    ]);

    assert.equal(markup.match(/x{100,}/g)?.[0]?.length, traceTextMaxChars);
    assert.match(markup, /Only the first 20,000 characters are shown\./);
});

/** Each call's label, then the body its row opens to. */
function renderBodies(tools: AgentExecutionJournalTool[]) {
    return tools
        .map((source) => {
            const tool = classifyTraceTool(source);
            return `${tool.label}\n${renderToStaticMarkup(<TurnTraceCallBody tool={tool} />)}`;
        })
        .join('\n');
}

function at(seconds: number) {
    return new Date(Date.UTC(2026, 2, 31, 15, 0, seconds)).toISOString();
}

function tool(overrides: Partial<AgentExecutionJournalTool>): AgentExecutionJournalTool {
    return {
        endedAt: at(2),
        startedAt: at(1),
        status: 'completed',
        toolCallId: 'call-1',
        toolName: 'bash',
        ...overrides,
    };
}

test('a sent message opens to everything: where it went, the message, then the command and output', () => {
    const markup = renderBodies([
        tool({
            input: {
                command:
                    "haus message send --target dm:@zach-knickerbocker --reply-to 1a2b3c4d --done <<'HAUSMSG'\nThe deploy is **green**.\nHAUSMSG",
            },
            output: {
                exit_code: 0,
                formatted_output:
                    'Message sent to dm:@zach-knickerbocker. Message ID: msg_1 (to reply in this message\'s thread, use target "dm:@zach-knickerbocker:1a2b")',
            },
            toolCallId: 'call-send',
            toolName: 'bash',
        }),
    ]);

    assert.match(markup, /<strong>green<\/strong>/);
    assert.match(markup, />DM</);
    // No disclosure inside a body: the command and the CLI's reply are open beside the message.
    assert.doesNotMatch(markup, /aria-expanded/);
    assert.ok(markup.indexOf('>Message<') < markup.indexOf('>Command<'));
    assert.ok(markup.indexOf('>Command<') < markup.indexOf('>Output<'));
    assert.match(markup, /HAUSMSG/);
    assert.match(markup, /to reply in this message/);
});

test('an MCP call shows its wire name, then its input and result as JSON trees', () => {
    const markup = renderBodies([
        tool({
            input: { first: 2, team: 'PRD' },
            output: { content: [{ text: '{"issues":[{"id":"PRD-1"}],"total":1}', type: 'text' }] },
            toolCallId: 'call-mcp',
            toolName: 'mcp__linear__list_issues',
        }),
    ]);

    assert.match(markup, />mcp__linear__list_issues</);
    assert.equal(markup.match(/role="treegrid"/g)?.length, 2);
    assert.match(markup, /aria-label="Input"/);
    assert.match(markup, /aria-label="Result"/);
    assert.match(markup, />\{1 key\}</);
    assert.doesNotMatch(markup, /&quot;content&quot;/);
});

test('terminal escapes a command printed are stripped from its output', () => {
    const markup = renderBodies([
        tool({
            input: { command: 'npm test' },
            output: {
                exit_code: 0,
                formatted_output: '\u001b[31m✖ src\u001b[39m\n\u001b[34mℹ pass 0\u001b[39m\n',
            },
            toolCallId: 'call-ansi',
        }),
    ]);

    assert.match(markup, /✖ src\nℹ pass 0/);
    assert.doesNotMatch(markup, /\[3\dm/);
});

test('every section label in a body is a micro label; what it names stays in sentence case', () => {
    const markup = renderBodies([
        tool({
            error: { exit_code: 1, formatted_output: 'no such file\n' },
            input: { command: 'ls /missing' },
            status: 'failed',
            toolCallId: 'call-failed',
        }),
    ]);

    const labels = [...markup.matchAll(/<span class="[^"]*uppercase[^"]*">([^<]+)<\/span>/g)].map(
        (match) => match[1]
    );
    assert.deepEqual(labels, ['Error', 'Command', 'Output']);
    assert.match(
        markup,
        /Command failed<span class="text-muted tabular-nums"> · exit code 1<\/span>/
    );
});
