// Ported from botiverse/raft-source packages/daemon/src/drivers/grokEventNormalizer.test.ts (FSL-1.1-ALv2)
import { expect, test } from 'bun:test';
import { createGrokTurnNormalizer } from './grok-turn-normalizer.ts';
import { createWorkspacePaths } from './workspace-paths.ts';

function normalizer() {
    const turn = createGrokTurnNormalizer({
        hostServerName: 'haus',
        paths: createWorkspacePaths(['/agents/a/workspace']),
        sessionId: 'session-1',
    });
    return {
        finish: () => turn.finish(),
        update: (update: Record<string, unknown>, sessionId = 'session-1') =>
            turn.notification('session/update', { sessionId, update }),
        xai: (update: Record<string, unknown>) =>
            turn.notification('_x.ai/session_notification', { sessionId: 'session-1', update }),
    };
}

test('surfaces assistant text and thought chunks for the active session only', () => {
    const turn = normalizer();

    expect(
        turn.update({
            content: { text: 'answer', type: 'text' },
            sessionUpdate: 'agent_message_chunk',
        })
    ).toEqual([{ id: 'text-1', text: 'answer', type: 'text-delta' }]);
    expect(
        turn.update({
            content: { text: 'reasoning', type: 'text' },
            sessionUpdate: 'agent_thought_chunk',
        })
    ).toEqual([
        { id: 'reasoning-2', type: 'reasoning-start' },
        { id: 'reasoning-2', text: 'reasoning', type: 'reasoning-delta' },
    ]);
    expect(
        turn.update({
            content: { text: 'more', type: 'text' },
            sessionUpdate: 'agent_message_chunk',
        })
    ).toEqual([
        { id: 'reasoning-2', type: 'reasoning-end' },
        { id: 'text-3', text: 'more', type: 'text-delta' },
    ]);
    expect(
        turn.update(
            {
                content: { text: 'wrong session', type: 'text' },
                sessionUpdate: 'agent_message_chunk',
            },
            'other'
        )
    ).toEqual([]);
});

test('emits each tool call and its outcome once; argument deltas are only progress', () => {
    const turn = normalizer();
    const call = {
        _meta: { 'x.ai/tool': { name: 'run_terminal_command', namespace: 'grok_build' } },
        rawInput: { command: 'pwd' },
        sessionUpdate: 'tool_call',
        title: 'run_terminal_command',
        toolCallId: 'tool-1',
    };

    expect(
        turn.xai({
            name: 'run_terminal_command',
            sessionUpdate: 'tool_call_delta_chunk',
            tool_call_id: 'tool-1',
            tool_index: 0,
        })
    ).toEqual([{ nativeType: 'tool_call_delta_chunk', type: 'progress' }]);
    expect(turn.update(call)).toEqual([
        {
            input: { command: 'pwd' },
            nativeName: 'run_terminal_command',
            providerExecuted: true,
            toolCallId: 'tool-1',
            toolName: 'bash',
            type: 'tool-call',
        },
    ]);
    expect(turn.update(call)).toEqual([{ nativeType: 'tool_call', type: 'progress' }]);
    const completed = {
        rawOutput: { exit_code: 0, output_for_prompt: '/agents/a/workspace\n' },
        sessionUpdate: 'tool_call_update',
        status: 'completed',
        toolCallId: 'tool-1',
    };
    expect(turn.update(completed)).toEqual([
        {
            nativeName: 'run_terminal_command',
            output: { exit_code: 0, output_for_prompt: '.\n' },
            providerExecuted: true,
            toolCallId: 'tool-1',
            toolName: 'bash',
            type: 'tool-result',
        },
    ]);
    expect(turn.update(completed)).toEqual([{ nativeType: 'tool_call_update', type: 'progress' }]);
});

test('an unannounced completion inside a turn still surfaces as a call and its result', () => {
    const turn = normalizer();

    expect(
        turn
            .update({
                sessionUpdate: 'tool_call_update',
                status: 'failed',
                toolCallId: 'tool-unannounced',
                title: 'read_file',
            })
            .map((event) => event.type)
    ).toEqual(['tool-call', 'tool-result']);
});

test('keeps interaction lifecycle and unknown extensions as progress', () => {
    const turn = normalizer();

    expect(
        turn.xai({
            kind: 'permission',
            sessionUpdate: 'pending_interaction',
            tool_call_id: 'tool-1',
        })
    ).toEqual([{ nativeType: 'pending_interaction', type: 'progress' }]);
    expect(turn.xai({ sessionUpdate: 'interaction_resolved', tool_call_id: 'tool-1' })).toEqual([
        { nativeType: 'interaction_resolved', type: 'progress' },
    ]);
    expect(
        turn.xai({ prompt_id: 'p-1', sessionUpdate: 'turn_completed', stop_reason: 'end_turn' })
    ).toEqual([{ nativeType: 'turn_completed', type: 'progress' }]);
});

test('a failed or cancelled Grok tool is an error, unless it reports the exit code of a command that ran', () => {
    const outcome = (status: string, rawOutput: unknown) => {
        const turn = normalizer();
        const meta = { 'x.ai/tool': { name: 'run_terminal_command' } };
        turn.update({
            _meta: meta,
            rawInput: { command: 'x' },
            sessionUpdate: 'tool_call',
            toolCallId: 't',
        });
        return turn.update({
            rawOutput,
            sessionUpdate: 'tool_call_update',
            status,
            toolCallId: 't',
        })[0];
    };

    expect(outcome('completed', { stdout: '' })).not.toHaveProperty('isError');
    expect(outcome('failed', { error: 'denied' })).toMatchObject({ isError: true });
    expect(outcome('failed', { exit_code: 2, stdout: '' })).not.toHaveProperty('isError');
});

test('a Haus host tool called through use_tool is the host tool, by its own name and input', () => {
    const turn = normalizer();
    const meta = { 'x.ai/tool': { name: 'use_tool', namespace: 'grok_build' } };

    expect(
        turn.update({
            _meta: meta,
            rawInput: { tool_input: { text: 'hi' }, tool_name: 'haus__echo' },
            sessionUpdate: 'tool_call',
            toolCallId: 'u-1',
        })
    ).toEqual([{ input: { text: 'hi' }, toolCallId: 'u-1', toolName: 'echo', type: 'tool-call' }]);
    expect(
        turn.update({
            rawOutput: {
                output: { OkayOutput: 'echo:hi' },
                server_name: 'haus',
                tool_name: 'echo',
                type: 'MCP',
            },
            sessionUpdate: 'tool_call_update',
            status: 'completed',
            toolCallId: 'u-1',
        })
    ).toEqual([{ output: 'echo:hi', toolCallId: 'u-1', toolName: 'echo', type: 'tool-result' }]);
});

test('ignores replayed history and reports retry_state as a typed session failure', () => {
    const turn = createGrokTurnNormalizer({
        hostServerName: 'haus',
        paths: createWorkspacePaths([]),
        sessionId: 's',
    });

    expect(
        turn.notification('session/update', {
            _meta: { isReplay: true },
            sessionId: 's',
            update: {
                content: { text: 'old', type: 'text' },
                sessionUpdate: 'agent_message_chunk',
            },
        })
    ).toEqual([]);
    expect(
        turn.notification('_x.ai/session_notification', {
            sessionId: 's',
            update: {
                error_type: 'rate_limit',
                message: '429 Too Many Requests\nretrying',
                sessionUpdate: 'retry_state',
                type: 'retrying',
            },
        })
    ).toEqual([
        {
            category: 'limit',
            severity: 'warning',
            title: '429 Too Many Requests',
            type: 'session-failure',
        },
    ]);
    expect(turn.notification('_x.ai/queue/changed', { entries: [], sessionId: 's' })).toEqual([
        { nativeType: '_x.ai/queue/changed', type: 'progress' },
    ]);
    expect(turn.notification('_x.ai/sessions/changed', { upserted: [] })).toEqual([]);
});

test('closes an open reasoning block when the turn settles', () => {
    const turn = normalizer();
    turn.update({
        content: { text: 'thinking', type: 'text' },
        sessionUpdate: 'agent_thought_chunk',
    });

    expect(turn.finish()).toEqual([{ id: 'reasoning-1', type: 'reasoning-end' }]);
    expect(turn.finish()).toEqual([]);
});
