import { describe, expect, test } from 'bun:test';
import { fatalRuntimeSessionFailure } from '../../harness/runtime-session-failure.ts';
import type { RuntimeSession } from '../driver.ts';
import { isRuntimeResumeRejection } from '../resume-rejected.ts';
import type { TurnEvent } from '../turn-event.ts';
import { captureScenarios } from './fixtures/capture-scenarios.ts';
import {
    eventSequence,
    replayDriver,
    replayStep,
    type StepOutcome,
} from './testing/replay-driver.ts';
import { readFixture } from './testing/replay-transport.ts';

/** Replays a recorded scenario through the driver; one outcome per step. */
async function replay(name: string) {
    const scenario = captureScenarios.find((candidate) => candidate.name === name);
    if (!scenario) {
        throw new Error(`No capture scenario ${name}.`);
    }
    const harness = replayDriver(name);
    const outcomes: StepOutcome[] = [];
    let session: RuntimeSession | undefined;
    try {
        for (const step of scenario.steps) {
            const outcome = await replayStep(step, session, harness.driver);
            session = outcome.session;
            outcomes.push(outcome);
        }
    } finally {
        await session?.destroy();
    }
    const turns = outcomes.filter((outcome) => outcome.events.length > 0);
    return { ...harness, outcomes, turns };
}

function written(transport: { written: readonly Record<string, unknown>[] }, method: string) {
    return transport.written.filter((message) => message.method === method);
}

interface Breakdown {
    cachedInputTokens: number;
    inputTokens: number;
    outputTokens: number;
}

/** The `last` request of every recorded usage update in a single-process fixture. */
function recordedRequests(name: string): Breakdown[] {
    return readFixture(name)
        .map((record) => JSON.parse(record.line) as { method?: string; params?: any })
        .filter((message) => message.method === 'thread/tokenUsage/updated')
        .map((message) => message.params.tokenUsage.last as Breakdown);
}

function summed(requests: readonly Breakdown[]) {
    const input = requests.reduce((sum, request) => sum + request.inputTokens, 0);
    const output = requests.reduce((sum, request) => sum + request.outputTokens, 0);
    return {
        cacheReadTokens: requests.reduce((sum, request) => sum + request.cachedInputTokens, 0),
        cacheWriteTokens: 0,
        inputTokens: input,
        outputTokens: output,
        totalTokens: input + output,
    };
}

function only<T extends TurnEvent['type']>(events: readonly TurnEvent[], type: T) {
    return events.filter((event): event is Extract<TurnEvent, { type: T }> => event.type === type);
}

describe('Codex fixtures', () => {
    test('a text turn starts the thread with Haus launch config and reports usage', async () => {
        const { transports, turns } = await replay('text-turn');
        const [transport] = transports;
        expect(transport?.written.map((message) => message.method)).toEqual([
            'initialize',
            'initialized',
            'config/read',
            'thread/start',
            'turn/start',
        ]);
        expect(written(transport!, 'thread/start')[0]?.params).toEqual({
            approvalPolicy: 'never',
            config: {
                agents: { enabled: false },
                features: { apps: false, multi_agent: false, plugins: false },
                mcp_servers: {
                    haus: {
                        bearer_token_env_var: 'HAUS_HOST_TOOL_TOKEN',
                        enabled: true,
                        url: 'http://127.0.0.1:9/mcp',
                    },
                },
                model_reasoning_effort: 'low',
                project_doc_max_bytes: 0,
                web_search: 'live',
            },
            cwd: '<root>/workspace',
            developerInstructions: 'You are a Haus test Agent. Follow the user exactly.',
            model: 'gpt-5.6-luna',
            sandbox: 'danger-full-access',
        });
        expect(written(transport!, 'turn/start')[0]?.params).toMatchObject({ summary: 'auto' });
        const events = turns[0]?.events ?? [];
        expect(eventSequence(events)).toEqual(['text-delta', 'step-finish', 'turn-finish']);
        expect(
            only(events, 'text-delta')
                .map((event) => event.text)
                .join('')
        ).toBe('OK');
        const [request] = recordedRequests('text-turn');
        expect(only(events, 'turn-finish')[0]?.usage).toEqual(summed([request!]));
        expect(only(events, 'step-finish')[0]?.contextTokens).toBe(request!.inputTokens);
    });

    test('a parsed file read is a read location ahead of an input-less shell call', async () => {
        const events = (await replay('shell-turn')).turns[0]?.events ?? [];
        const location = only(events, 'tool-read-location')[0];
        const call = only(events, 'tool-call')[0];
        expect(location?.path).toBe('<root>/workspace/notes-missing.txt');
        expect(call).toMatchObject({
            input: {},
            invalid: true,
            nativeName: 'exec_command',
            providerExecuted: true,
            toolCallId: location?.toolCallId,
            toolName: 'bash',
        });
        expect(only(events, 'tool-result')[0]?.output).toMatchObject({ exit_code: 0 });
        expect(eventSequence(events).at(-1)).toBe('turn-finish');
    });

    test('a host tool call is reported by its own name, not as a builtin', async () => {
        const events = (await replay('host-tool-turn')).turns[0]?.events ?? [];
        const call = only(events, 'tool-call')[0];
        expect(call?.toolName).toBe('haus_probe');
        expect(call?.providerExecuted).toBeUndefined();
        expect(call?.dynamic).toBeUndefined();
        expect(only(events, 'tool-result')[0]?.output).toMatchObject({
            content: [{ text: 'PROBE-7731', type: 'text' }],
        });
        expect(
            only(events, 'text-delta')
                .map((event) => event.text)
                .join('')
        ).toBe('PROBE-7731');
    });

    test('an apply_patch restates each file as a sourced fileChange', async () => {
        const events = (await replay('file-edit-turn')).turns[0]?.events ?? [];
        const [patch, ...files] = only(events, 'tool-call');
        expect(patch).toMatchObject({ input: {}, providerExecuted: true, toolName: 'apply_patch' });
        expect(files.map((file) => [file.toolName, file.sourceToolCallId, file.input])).toEqual([
            ['fileChange', patch?.toolCallId, { event: 'create', path: 'notes.txt' }],
            ['fileChange', patch?.toolCallId, { event: 'create', path: 'todo.txt' }],
        ]);
        expect(eventSequence(events)).toContain('tool-result:apply_patch');
        // The patch call and the reply are separate model requests; the turn counts both.
        const requests = recordedRequests('file-edit-turn');
        expect(requests.length).toBeGreaterThan(1);
        expect(only(events, 'turn-finish')[0]?.usage).toEqual(summed(requests));
    });

    test('a steer during a tool call is delivered as turn/steer on the running turn', async () => {
        const { transports, turns } = await replay('steer-turn');
        expect(turns[0]?.steered).toEqual([{ delivered: true }]);
        const turnId = only(turns[0]?.events ?? [], 'turn-finish').length;
        expect(turnId).toBe(1);
        const [steer] = written(transports[0]!, 'turn/steer');
        expect(steer?.params).toMatchObject({
            input: [{ text: 'Change the final reply to exactly INTERJECTED and nothing else.' }],
            threadId: expect.any(String),
        });
        expect(typeof (steer?.params as { expectedTurnId?: unknown }).expectedTurnId).toBe(
            'string'
        );
        expect(
            only(turns[0]?.events ?? [], 'text-delta')
                .map((event) => event.text)
                .join('')
        ).toBe('INTERJECTED');
    });

    test('a steer right after a tool finishes waits for the next turn content (Raft #238)', async () => {
        const { transports, turns } = await replay('steer-after-tool-turn');
        expect(turns[0]?.steered).toEqual([{ delivered: true }]);
        expect(written(transports[0]!, 'turn/steer')).toHaveLength(1);
        expect(eventSequence(turns[0]?.events ?? []).at(-1)).toBe('turn-finish');
    });

    test('Stop interrupts the running turn, settles it, and the session takes the next turn', async () => {
        const { transports, turns } = await replay('interrupt-turn');
        expect(eventSequence(turns[0]?.events ?? [])).toEqual([
            'tool-call:bash',
            'step-finish',
            'turn-finish',
            'abort',
        ]);
        expect(written(transports[0]!, 'turn/interrupt')[0]?.params).toMatchObject({
            turnId: expect.any(String),
        });
        expect(eventSequence(turns[1]?.events ?? []).at(-1)).toBe('turn-finish');
    });

    test('resume reopens the stored thread on a new app-server without re-counting usage', async () => {
        const { transports, turns, outcomes } = await replay('resume-turn');
        expect(transports).toHaveLength(2);
        const started = written(transports[0]!, 'thread/start');
        const [resume] = written(transports[1]!, 'thread/resume');
        expect(started).toHaveLength(1);
        expect(resume?.params).toMatchObject({ excludeTurns: true, threadId: expect.any(String) });
        expect(outcomes[2]?.session?.isResume).toBe(true);
        expect(outcomes[2]?.session?.sessionId).toEqual(
            (resume?.params as { threadId: string }).threadId
        );
        const second = turns[1]?.events ?? [];
        expect(
            only(second, 'text-delta')
                .map((event) => event.text)
                .join('')
        ).toBe('HARBOR_7429');
        // The resumed app-server re-sends the previous turn's usage under that turn's id.
        expect(only(second, 'step-finish')).toHaveLength(1);
        expect(only(second, 'turn-finish')[0]?.usage?.inputTokens).toBe(11_071);
    });

    test('a resume of a missing rollout is a resume rejection', async () => {
        const harness = replayDriver('missing-rollout');
        const error = await harness.driver
            .openSession({
                resumeFrom: {
                    runtime: 'codex',
                    threadId: '01a00000-0000-7000-8000-000000000000',
                    version: 1,
                },
                sessionId: 'fixture',
            })
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(Error);
        expect(isRuntimeResumeRejection(error)).toBe(true);
    });

    test('a provider request error fails the turn with its message and keeps usage', async () => {
        const events = (await replay('unknown-model-turn')).turns[0]?.events ?? [];
        expect(eventSequence(events)).toEqual(['session-failure', 'turn-finish', 'error']);
        expect(only(events, 'session-failure')[0]).toMatchObject({
            category: 'service',
            severity: 'error',
        });
        expect(String((only(events, 'error')[0]?.error as Error).message)).toContain(
            'gpt-haus-missing-model'
        );
    });

    test('a rejected credential is fatal on its first retry warning', async () => {
        const events = (await replay('logged-out-turn')).turns[0]?.events ?? [];
        const [first] = only(events, 'session-failure');
        expect(first).toMatchObject({ category: 'access', severity: 'warning' });
        expect(fatalRuntimeSessionFailure(first!)).not.toBeNull();
    });

    test('native image generation keeps the saved path and drops the inlined image', async () => {
        const events = (await replay('image-generation-turn')).turns[0]?.events ?? [];
        const call = only(events, 'tool-call').find((event) => event.toolName === 'image_gen');
        const result = only(events, 'tool-result').find((event) => event.toolName === 'image_gen');
        expect(call?.providerExecuted).toBe(true);
        expect(result?.output).toMatchObject({
            savedPath: expect.stringMatching(/generated_images\/.+\.png$/u),
            status: 'completed',
        });
        expect(JSON.stringify(result?.output)).not.toContain('base64');
    });
});
