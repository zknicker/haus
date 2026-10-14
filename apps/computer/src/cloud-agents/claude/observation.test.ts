import { expect, test } from 'bun:test';
import type { ClaudeSession, ClaudeSessionEvent } from './controller.ts';
import { claudeRunObservation } from './observation.ts';

const ref = { runId: 'car_run', workId: 'caw_work' };
const observedAt = '2026-10-14T12:00:00.000Z';
const prompt = event({
    message: { content: 'HAUS_CLOUD_RUN=caw_work/car_run\n\nTrim the copy.' },
    type: 'user',
    uuid: 'prompt-1',
});

function event(payload: Record<string, unknown>): ClaudeSessionEvent {
    return { payload, sequence: '1' };
}

function session(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
    return {
        lastEventAt: '2026-10-14T11:59:00.000Z',
        pendingAction: null,
        status: 'active',
        workerStatus: 'running',
        ...overrides,
    };
}

/** Events newest first, as the controller returns them. */
function observe(chronological: ClaudeSessionEvent[], current = session()) {
    return claudeRunObservation({
        cancelRequestId: 'haus-cancel-car_run',
        events: [...chronological].reverse(),
        observedAt,
        ref,
        session: current,
    });
}

function result(fields: Record<string, unknown>) {
    return event({
        is_error: false,
        result: 'Trimmed the settings copy.',
        subtype: 'success',
        total_cost_usd: 0.25,
        type: 'result',
        usage: { input_tokens: 100, output_tokens: 20 },
        ...fields,
    });
}

function toolUse(id: string, name: string, input: unknown) {
    return event({
        message: { content: [{ id, input, name, type: 'tool_use' }] },
        type: 'assistant',
    });
}

test('a prompt Claude has not taken yet is queued', () => {
    expect(observe([])).toMatchObject({ status: 'queued' });
});

test('a running worker reports its latest step', () => {
    expect(observe([prompt, toolUse('t1', 'Bash', { command: 'bun test' })])).toMatchObject({
        activity: { summary: 'Using Bash' },
        providerRunId: 'prompt-1',
        rawStatus: 'running',
        status: 'running',
    });
});

test('an open question settles the Run as pending input with the question', () => {
    const asked = toolUse('t1', 'AskUserQuestion', {
        questions: [
            {
                options: [{ label: '9am' }, { label: '10am' }],
                question: 'When should the reminder fire?',
            },
        ],
    });
    expect(observe([prompt, asked], session({ workerStatus: 'requires_action' }))).toMatchObject({
        status: 'pending_input',
        summary: 'When should the reminder fire? (9am / 10am)',
    });
});

test('a permission prompt reads as the tool Claude wants to use', () => {
    expect(
        observe(
            [prompt, toolUse('t1', 'WebFetch', {})],
            session({ workerStatus: 'requires_action' })
        )
    ).toMatchObject({ status: 'pending_input', summary: 'Claude is asking to use WebFetch.' });
});

test('an idle worker after a result completes with its summary and usage', () => {
    expect(observe([prompt, result({})], session({ workerStatus: 'idle' }))).toMatchObject({
        status: 'completed',
        summary: 'Trimmed the settings copy.',
        usage: { costUsd: 0.25, inputTokens: 100, outputTokens: 20 },
    });
});

test('an error result fails the Run with Claude’s subtype', () => {
    expect(
        observe(
            [prompt, result({ is_error: true, result: null, subtype: 'error_max_turns' })],
            session({ workerStatus: 'idle' })
        )
    ).toMatchObject({ errorCode: 'claude-error_max_turns', status: 'failed' });
});

test('background tasks keep an idle worker running', () => {
    const started = event({ subtype: 'task_started', task_id: 'bg1', type: 'system' });
    expect(observe([prompt, started, result({})], session({ workerStatus: 'idle' }))).toMatchObject(
        { activity: { summary: 'Waiting on 1 background task.' }, status: 'running' }
    );
});

test('Haus’s own interrupt, once answered, cancels the Run', () => {
    const answered = event({
        response: { request_id: 'haus-cancel-car_run', subtype: 'success' },
        type: 'control_response',
    });
    expect(observe([prompt, answered], session({ workerStatus: 'idle' }))).toMatchObject({
        status: 'cancelled',
    });
});

test('an archived session that never took the prompt expires', () => {
    expect(observe([], session({ status: 'archived', workerStatus: 'idle' }))).toMatchObject({
        status: 'expired',
    });
});

test('the pushed branch and its pull request are reported together', () => {
    expect(
        observe(
            [
                prompt,
                toolUse('t1', 'Bash', { command: 'git push -u origin claude/trim-copy' }),
                result({ result: 'Opened https://github.com/zknicker/haus/pull/42' }),
            ],
            session({ workerStatus: 'idle' })
        ).branches
    ).toEqual([
        {
            branch: 'claude/trim-copy',
            pullRequestUrl: 'https://github.com/zknicker/haus/pull/42',
            repository: 'zknicker/haus',
        },
    ]);
});
