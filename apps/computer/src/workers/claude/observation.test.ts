import { expect, test } from 'bun:test';
import type { ClaudeSession, ClaudeSessionEvent } from './controller.ts';
import { claudeRunObservation } from './observation.ts';

const ref = { turnId: 'car_run', workerId: 'caw_work' };
const observedAt = '2026-10-14T12:00:00.000Z';
const prompt = event({
    message: { content: 'HAUS_CLOUD_RUN=caw_work/car_run\n\nTrim the copy.' },
    type: 'user',
    uuid: 'prompt-1',
});

function event(payload: Record<string, unknown>): ClaudeSessionEvent {
    return { createdAt: null, payload, sequence: '1' };
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

test('a taken prompt dates the Run from when Claude logged it, not from the reading', () => {
    const logged = { ...prompt, createdAt: '2026-10-14T11:02:16.640042Z' };
    expect(observe([logged])).toMatchObject({
        observedAt,
        startedAt: '2026-10-14T11:02:16.640Z',
        status: 'running',
    });
    expect(observe([prompt])).not.toHaveProperty('startedAt');
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

test('a settled result carries its final answer with the Haus lines read', () => {
    const finished = result({
        result: 'Opened https://github.com/zknicker/haus/pull/42 for review.\n\nHaus-Outcome: needs-you\nHaus-Person: @zach',
    });
    expect(observe([prompt, finished], session({ workerStatus: 'idle' })).result).toEqual({
        outcome: 'needs-you',
        personHandle: 'zach',
        pullRequestUrls: ['https://github.com/zknicker/haus/pull/42'],
        text: 'Opened https://github.com/zknicker/haus/pull/42 for review.',
    });
});

test('an open question is the result text of the pending input', () => {
    const asked = toolUse('t1', 'AskUserQuestion', {
        questions: [{ options: [], question: 'Which branch should I rebase onto?' }],
    });
    expect(observe([prompt, asked], session({ workerStatus: 'requires_action' })).result).toEqual({
        outcome: null,
        personHandle: null,
        pullRequestUrls: [],
        text: 'Which branch should I rebase onto?',
    });
});

test('an error with no result text has no final answer', () => {
    expect(
        observe(
            [prompt, result({ is_error: true, result: null, subtype: 'error_max_turns' })],
            session({ workerStatus: 'idle' })
        ).result
    ).toBeNull();
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

test("a predecessor that already finished is unaffected by a later follow-up's own result", () => {
    const followUpPrompt = event({
        message: { content: 'HAUS_CLOUD_RUN=caw_work/car_followup\n\nOne more thing.' },
        type: 'user',
        uuid: 'prompt-2',
    });
    const followUpResult = result({ result: 'Finished the follow-up.' });
    const observation = observe(
        [prompt, result({}), followUpPrompt, followUpResult],
        session({ workerStatus: 'idle' })
    );
    expect(observation).toMatchObject({
        status: 'completed',
        summary: 'Trimmed the settings copy.',
    });
});

test("a later turn's result never settles an earlier turn whose window has none", () => {
    const followUpPrompt = event({
        message: { content: 'HAUS_CLOUD_RUN=caw_work/car_followup\n\nOne more thing.' },
        type: 'user',
        uuid: 'prompt-2',
    });
    const chronological = [prompt, followUpPrompt, result({ result: 'Finished the follow-up.' })];

    const predecessor = observe(chronological, session({ workerStatus: 'idle' }));
    expect(predecessor.status).toBe('running');
    expect(predecessor).not.toHaveProperty('report');

    const followUp = claudeRunObservation({
        cancelRequestId: 'haus-cancel-car_followup',
        events: [...chronological].reverse(),
        observedAt,
        ref: { turnId: 'car_followup', workerId: 'caw_work' },
        session: session({ workerStatus: 'idle' }),
    });
    expect(followUp).toMatchObject({ status: 'completed', summary: 'Finished the follow-up.' });
});

test("a self-started turn's own trivial result never replaces this Run's real one", () => {
    // Claude Code can start a turn on its own while idle (a background task
    // finishing, idle compaction) once this Run's own prompted turn has
    // already produced its own result, and that self-started turn's result
    // lands chronologically after it, in the same window (TECH-8). The FIRST
    // result in the window is always the one answering this Run's own
    // prompt.
    const real = result({
        result: 'Fixed the flaky test. Opened https://github.com/zknicker/haus/pull/99.',
    });
    const selfStarted = result({ result: 'Done.' });
    const observation = observe([prompt, real, selfStarted], session({ workerStatus: 'idle' }));
    expect(observation).toMatchObject({
        report: { text: 'Fixed the flaky test. Opened https://github.com/zknicker/haus/pull/99.' },
        status: 'completed',
        summary: 'Fixed the flaky test. Opened https://github.com/zknicker/haus/pull/99.',
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

test("the Run's tool calls become its steps, finished by their results", () => {
    const failed = event({
        message: {
            content: [
                { content: '1 fail', is_error: true, tool_use_id: 'tu_1', type: 'tool_result' },
            ],
        },
        type: 'user',
    });
    const reading = observe([
        prompt,
        toolUse('tu_1', 'Bash', { command: 'bun test' }),
        failed,
        toolUse('tu_2', 'Read', { file_path: 'src/app.ts' }),
    ]);

    expect(reading.steps).toMatchObject([
        { kind: 'run', label: 'bun test', output: '1 fail', state: 'failed' },
        { kind: 'read', label: 'src/app.ts', output: null, state: 'running' },
    ]);
    expect(observe([prompt])).not.toHaveProperty('steps');
});
