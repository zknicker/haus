// Ported from botiverse/raft-source packages/daemon/src/drivers/claudeEventNormalizer.test.ts (FSL-1.1-ALv2)
import { expect, test } from 'bun:test';
import { ClaudeEventNormalizer } from './claude-event-normalizer.ts';
import { type ParsedClaudeLine, parseClaudeLine } from './claude-messages.ts';
import { createWorkspaceStripper } from './claude-tool-names.ts';

function createNormalizer(now = () => Date.now()) {
    const normalizer = new ClaudeEventNormalizer({
        hostServer: 'haus',
        now,
        strip: createWorkspaceStripper(['/agent/workspace']),
    });
    return (message: Record<string, unknown>) => normalizer.normalize(parse(message));
}

function parse(message: Record<string, unknown>): ParsedClaudeLine {
    const parsed = parseClaudeLine(JSON.stringify(message));
    if (!parsed || 'invalid' in parsed) {
        throw new Error(`Unparsed fixture: ${JSON.stringify(message)}`);
    }
    return parsed;
}

const assistant = (content: unknown[], extra: Record<string, unknown> = {}) => ({
    message: { content, role: 'assistant' },
    type: 'assistant',
    ...extra,
});

test('normalizes provider API failure assistant text as an error', () => {
    const [event] = createNormalizer()(
        assistant([{ text: 'API Error: Unable to connect to API (ECONNRESET)', type: 'text' }])
    );
    expect(event).toMatchObject({
        error: { message: 'API Error: Unable to connect to API (ECONNRESET)' },
        type: 'error',
    });
});

test('normalizes provider API 400 assistant text as an error', () => {
    const message = 'API Error: 400 messages.2.content.0.text.start_timestamp: Extra inputs';
    expect(createNormalizer()(assistant([{ text: message, type: 'text' }]))).toMatchObject([
        { error: { message }, type: 'error' },
    ]);
});

test('leaves embedded API failure discussion assistant text as text', () => {
    const events = createNormalizer()(
        assistant([
            { text: 'I found the failure: API Error: Unable to connect to API.', type: 'text' },
        ])
    );
    expect(events).toEqual([{ nativeType: 'assistant', type: 'progress' }]);
});

test('does not convert API failure text to error when the turn also emits a tool call', () => {
    const events = createNormalizer()(
        assistant([
            { text: 'API Error: Unable to connect to API (ECONNRESET)', type: 'text' },
            { id: 'toolu_1', input: { command: 'true' }, name: 'Bash', type: 'tool_use' },
        ])
    );
    expect(events.map((event) => event.type)).toEqual(['tool-call']);
});

test('normalizes stream events as progress, and text and thinking deltas as content', () => {
    const normalize = createNormalizer();
    expect(normalize({ event: { type: 'message_start' }, type: 'stream_event' })).toEqual([
        { nativeType: 'stream_event:message_start', type: 'progress' },
    ]);
    normalize({
        event: { content_block: { type: 'thinking' }, index: 0, type: 'content_block_start' },
        type: 'stream_event',
    });
    expect(
        normalize({
            event: {
                delta: { thinking: 'hmm', type: 'thinking_delta' },
                index: 0,
                type: 'content_block_delta',
            },
            type: 'stream_event',
        })
    ).toMatchObject([{ text: 'hmm', type: 'reasoning-delta' }]);
    expect(
        normalize({ event: { index: 0, type: 'content_block_stop' }, type: 'stream_event' })
    ).toMatchObject([{ type: 'reasoning-end' }]);
    normalize({
        event: { content_block: { type: 'text' }, index: 1, type: 'content_block_start' },
        type: 'stream_event',
    });
    expect(
        normalize({
            event: {
                delta: { text: 'partial', type: 'text_delta' },
                index: 1,
                type: 'content_block_delta',
            },
            type: 'stream_event',
        })
    ).toMatchObject([{ text: 'partial', type: 'text-delta' }]);
});

test('normalizes compaction status as progress and the boundary as a compaction pair', () => {
    const normalize = createNormalizer();
    expect(normalize({ status: 'compacting', subtype: 'status', type: 'system' })).toEqual([
        { nativeType: 'system:status', type: 'progress' },
    ]);
    expect(
        normalize({
            compact_metadata: { post_tokens: 570, pre_tokens: 13_127, trigger: 'manual' },
            subtype: 'compact_boundary',
            type: 'system',
        })
    ).toEqual([{ nativeType: 'system:compact_boundary', type: 'progress' }]);
    // No summary follows here, so the next message reports the compaction without one.
    const events = normalize({ status: null, subtype: 'status', type: 'system' });
    expect(events.map((event) => event.type)).toEqual(['tool-call', 'tool-result']);
    expect(events[1]).toMatchObject({
        output: { tokensAfter: 570, tokensBefore: 13_127, trigger: 'manual' },
        toolName: 'compaction',
    });
});

test('6b: a sub-agent tool_use keeps explicit lineage and never becomes an Agent call', () => {
    const events = createNormalizer()(
        assistant(
            [{ id: 'toolu_inner', input: { file_path: '/x.ts' }, name: 'Read', type: 'tool_use' }],
            {
                parent_tool_use_id: 'toolu_outer_agent_1',
            }
        )
    );
    expect(events).toEqual([
        {
            input: { file_path: '/x.ts' },
            parentToolCallId: 'toolu_outer_agent_1',
            toolCallId: 'toolu_inner',
            toolName: 'Read',
            type: 'subagent-tool-call',
        },
    ]);
});

test('6b: system task lifecycle becomes sub-agent events keyed on closed ids', () => {
    const normalize = createNormalizer();
    expect(
        normalize({
            subagent_type: 'Explore',
            subtype: 'task_started',
            task_id: 'task_abc',
            task_type: 'local_agent',
            tool_use_id: 'toolu_outer',
            type: 'system',
        })
    ).toEqual([
        {
            subagentType: 'Explore',
            taskId: 'task_abc',
            toolCallId: 'toolu_outer',
            type: 'subagent-started',
        },
    ]);
    for (const status of ['completed', 'failed', 'stopped'] as const) {
        const [event] = normalize({
            status,
            subtype: 'task_notification',
            summary: 'secret summary text',
            task_id: 'task_abc',
            type: 'system',
        });
        expect(event).toMatchObject({ taskId: 'task_abc', type: 'subagent-status' });
        expect(JSON.stringify(event)).not.toContain('secret summary');
    }
});

test('a failed announced sub-agent is activity, an unannounced task failure ends the turn', () => {
    const normalize = createNormalizer();
    normalize({
        subtype: 'task_started',
        task_id: 't1',
        task_type: 'local_agent',
        tool_use_id: 'a',
        type: 'system',
    });
    const failed = {
        patch: { error: 'boom', status: 'failed' },
        subtype: 'task_updated',
        type: 'system',
    };
    expect(normalize({ ...failed, task_id: 't1' })).toEqual([
        { status: 'failed', taskId: 't1', type: 'subagent-status' },
    ]);
    expect(normalize({ ...failed, task_id: 't2' })).toMatchObject([
        { error: { message: 'boom' }, type: 'error' },
    ]);
});

test('a sub-agent error field is the sub-agent’s, never the turn’s', () => {
    const events = createNormalizer()(
        assistant([{ text: 'API Error: 500 overloaded', type: 'text' }], {
            error: 'server_error',
            parent_tool_use_id: 'toolu_outer',
        })
    );
    expect(events).toEqual([{ nativeType: 'assistant', type: 'progress' }]);
});

test('normalizes user tool_result as a steering boundary with the call’s identity', () => {
    const normalize = createNormalizer();
    normalize(
        assistant([{ id: 'toolu_123', input: { pattern: '*' }, name: 'Glob', type: 'tool_use' }])
    );
    expect(
        normalize({
            message: {
                content: [{ content: 'ok', tool_use_id: 'toolu_123', type: 'tool_result' }],
                role: 'user',
            },
            type: 'user',
        })
    ).toEqual([
        {
            nativeName: 'Glob',
            output: 'ok',
            providerExecuted: true,
            toolCallId: 'toolu_123',
            toolName: 'glob',
            type: 'tool-result',
        },
    ]);
});

test('task #17: a non-zero Bash exit is an ok call with the exit code; other errors fail', () => {
    const normalize = createNormalizer();
    normalize(
        assistant([
            { id: 'toolu_9', input: { command: 'pnpm test' }, name: 'Bash', type: 'tool_use' },
        ])
    );
    normalize(
        assistant([
            { id: 'toolu_10', input: { file_path: '/nope' }, name: 'Read', type: 'tool_use' },
        ])
    );
    const result = (id: string, content: unknown) =>
        normalize({
            message: {
                content: [{ content, is_error: true, tool_use_id: id, type: 'tool_result' }],
                role: 'user',
            },
            type: 'user',
        });
    expect(result('toolu_9', 'Exit code 1\n2 tests failed')).toMatchObject([
        { output: { exitCode: 1, stdout: 'Exit code 1\n2 tests failed' }, type: 'tool-result' },
    ]);
    expect(result('toolu_10', [{ text: 'File does not exist.', type: 'text' }])).toMatchObject([
        { error: 'File does not exist.', toolName: 'read', type: 'tool-error' },
    ]);
});

test('workspace paths in tool input and output become workspace-relative', () => {
    const normalize = createNormalizer();
    expect(
        normalize(
            assistant([
                {
                    id: 'toolu_r',
                    input: { command: 'ls /agent/workspace && cat /agent/workspace/a.ts' },
                    name: 'Bash',
                    type: 'tool_use',
                },
            ])
        )
    ).toMatchObject([{ input: { command: 'ls <workspace> && cat a.ts' } }]);
});
