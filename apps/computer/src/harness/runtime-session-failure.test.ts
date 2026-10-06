import { expect, test } from 'bun:test';
import { classifyRuntimeFailure, isRetryableRuntimeFailure } from '../runtime-failure.ts';
import { fatalRuntimeSessionFailure } from './runtime-session-failure.ts';

function update(failure: Record<string, unknown>) {
    return {
        _meta: { jetbrains: { air: { sessionFailure: { id: 'f', revision: 1, ...failure } } } },
        sessionUpdate: 'session_info_update',
    };
}

test('a rejected-credential retry is fatal and classifies as authentication', () => {
    const failure = fatalRuntimeSessionFailure(
        update({ category: 'access', severity: 'warning', title: 'Reconnecting... 1/5' })
    );
    expect(failure?.severity).toBe('warning');
    expect(classifyRuntimeFailure(failure)).toBe('authentication');
    expect(isRetryableRuntimeFailure('authentication')).toBe(false);
});

test('transient retries and informational notices never end the turn', () => {
    for (const failure of [
        { category: 'connection', severity: 'warning', title: 'Reconnecting... 1/5' },
        { category: 'limit', severity: 'warning', title: 'Reconnecting... 2/5' },
        { category: 'service', severity: 'warning', title: 'Reconnecting... 3/5' },
        // An MCP or transport notice may quote a 401 without the model credential failing.
        {
            category: 'unknown',
            severity: 'warning',
            title: 'Falling back from WebSockets to HTTPS transport. unexpected status 401',
        },
    ]) {
        expect(fatalRuntimeSessionFailure(update(failure))).toBeNull();
    }
});

test('a terminal failure on the prompt response is fatal and keeps its provider kind', () => {
    const response = (title: string) => ({
        _meta: {
            jetbrains: {
                air: { sessionFailure: { category: 'service', severity: 'error', title } },
            },
        },
        stopReason: 'end_turn',
    });
    expect(
        classifyRuntimeFailure(
            fatalRuntimeSessionFailure(
                response('unexpected status 401 Unauthorized: Incorrect API key provided: sk-***')
            )
        )
    ).toBe('authentication');
    expect(
        classifyRuntimeFailure(
            fatalRuntimeSessionFailure(response('unexpected status 503 Service Unavailable'))
        )
    ).toBe('transport');
});

test('ignores raw parts that carry no typed session failure', () => {
    for (const raw of [
        null,
        { sessionUpdate: 'usage_update' },
        { _meta: { codex: { threadStatus: { type: 'systemError' } } } },
        update({ category: 'access', severity: 'fatal', title: 'x' }),
    ]) {
        expect(fatalRuntimeSessionFailure(raw)).toBeNull();
    }
});

test('Claude Code sub-agent and task raw parts are never a fatal session failure', () => {
    const rawValues = [
        {
            type: 'system',
            subtype: 'task_updated',
            task_id: 't1',
            patch: { status: 'failed', error: 'x' },
        },
        { type: 'system', subtype: 'task_notification', task_id: 't1', status: 'failed' },
        { type: 'assistant', parent_tool_use_id: 'toolu_1', error: 'rate_limit', message: {} },
        { type: 'tool_progress', tool_use_id: 'toolu_1', parent_tool_use_id: 'toolu_1' },
    ];
    for (const rawValue of rawValues) {
        expect(fatalRuntimeSessionFailure(rawValue)).toBeNull();
    }
});
