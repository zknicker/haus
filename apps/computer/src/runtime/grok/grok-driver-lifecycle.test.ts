import { afterAll, expect, test } from 'bun:test';
import { makeDaemonRuntime } from '../../daemon-runtime.ts';
import type { SteerResult } from '../driver.ts';
import { runtimeProcessOwner } from '../process-registry.ts';
import { isRuntimeResumeRejection } from '../resume-rejected.ts';
import { collect, replayDriver, significant, text } from './fixtures/replay-driver.ts';
import { createGrokDriver } from './grok-driver.ts';

// Steering, cancel, and failure paths, replayed from captured fixtures. `prompt-auth-failure`
// and `crash` are derived from the captured text turn (a typed 401 transcribed from a real
// bad-key probe; a process that dies mid-stream), since a live capture cannot produce them.
const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
const signal = () => new AbortController().signal;

test('steer mid-turn interjects into the running prompt once Grok is streaming', async () => {
    const replay = await replayDriver('interject', runtime);
    try {
        const session = await replay.driver.openSession({
            resumeFrom: undefined,
            sessionId: 'agt-1',
        });
        expect(await session.steer('too early')).toEqual({ delivered: false, reason: 'idle' });
        const turn = await session.startTurn({ prompt: 'sleep then reply', signal: signal() });
        let steered: Promise<SteerResult> | undefined;
        const events = await collect(turn, (event) => {
            if (event.type === 'tool-call') {
                steered ??= session.steer('Change the final reply to exactly INTERJECTED.');
            }
        });

        expect(await steered).toEqual({ delivered: true });
        expect(text(events)).toContain('INTERJECTED');
        const interject = (await replay.messages()).find(
            (message) => message.method === '_x.ai/interject'
        );
        expect(interject).toMatchObject({
            params: {
                sessionId: session.sessionId,
                text: 'Change the final reply to exactly INTERJECTED.',
            },
        });
        expect(await session.steer('after the turn')).toEqual({ delivered: false, reason: 'idle' });
        await session.stop();
    } finally {
        await replay.cleanup();
    }
});

test('cancel mid-tool sends session/cancel, keeps the turn usage, ends in abort, and the session takes the next prompt', async () => {
    const replay = await replayDriver('cancel', runtime);
    try {
        const session = await replay.driver.openSession({
            resumeFrom: undefined,
            sessionId: 'agt-1',
        });
        const abort = new AbortController();
        const turn = await session.startTurn({ prompt: 'sleep 30', signal: abort.signal });
        const events = significant(
            await collect(turn, (event) => {
                if (event.type === 'tool-call') {
                    abort.abort(new Error('Stop'));
                }
            })
        );
        await turn.settle();

        expect(events.slice(-2).map((event) => event.type)).toEqual(['turn-finish', 'abort']);
        expect(events.at(-2)).toMatchObject({ usage: { inputTokens: expect.any(Number) } });
        expect(
            (await replay.messages()).some((message) => message.method === 'session/cancel')
        ).toBe(true);
        const after = await collect(await session.startTurn({ prompt: 'AFTER', signal: signal() }));
        expect(text(after)).toContain('AFTER');
        expect(after.at(-1)).toMatchObject({ type: 'turn-finish' });
        await session.stop();
    } finally {
        await replay.cleanup();
    }
});

test('a session Grok has no record of is a resume rejection', async () => {
    const replay = await replayDriver('missing-session', runtime);
    try {
        const opened = replay.driver.openSession({
            resumeFrom: {
                runtime: 'grok-build',
                sessionId: '01a15a09-0000-7000-8000-000000000000',
                version: 1,
            },
            sessionId: 'agt-1',
        });
        const error = await opened.catch((caught: unknown) => caught);

        expect(String(error)).toContain('Grok Build session not found');
        expect(isRuntimeResumeRejection(error)).toBe(true);
    } finally {
        await replay.cleanup();
    }
});

test('a rejected login fails the open with an actionable message, not a resume rejection', async () => {
    const replay = await replayDriver('auth-failure', runtime);
    try {
        const error = await replay.driver
            .openSession({ resumeFrom: undefined, sessionId: 'agt-1' })
            .catch((caught: unknown) => caught);

        expect(String(error)).toContain('Run `grok login`');
        expect(isRuntimeResumeRejection(error)).toBe(false);
    } finally {
        await replay.cleanup();
    }
});

test('a provider 401 mid-prompt is a fatal access failure, then the turn error', async () => {
    const replay = await replayDriver('prompt-auth-failure', runtime);
    try {
        const session = await replay.driver.openSession({
            resumeFrom: undefined,
            sessionId: 'agt-1',
        });
        const events = significant(
            await collect(await session.startTurn({ prompt: 'PONG', signal: signal() }))
        );

        expect(events.map((event) => event.type)).toEqual(['session-failure', 'error']);
        expect(events[0]).toMatchObject({
            category: 'access',
            severity: 'error',
            title: expect.stringContaining('Unauthorized (401)'),
        });
        await session.destroy();
    } finally {
        await replay.cleanup();
    }
});

test('a Grok crash mid-stream fails the turn with its exit and stderr', async () => {
    const replay = await replayDriver('crash', runtime);
    try {
        const session = await replay.driver.openSession({
            resumeFrom: undefined,
            sessionId: 'agt-1',
        });
        const events = await collect(await session.startTurn({ prompt: 'PONG', signal: signal() }));
        const error = events.at(-1);

        expect(error?.type).toBe('error');
        const message = String(error?.type === 'error' ? (error.error as Error).message : '');
        expect(message).toContain('Grok exited (code 101)');
        expect(message).toContain('fixture crash');
        // Parking a dead process yields resume state without keeping anything warm.
        expect(await session.detach()).toMatchObject({
            runtime: 'grok-build',
            sessionId: session.sessionId,
        });
    } finally {
        await replay.cleanup();
    }
});

test('a missing grok executable fails the open with an install hint', async () => {
    const replay = await replayDriver('text', runtime);
    try {
        const driver = createGrokDriver({
            command: ['/nonexistent/haus-test/grok'],
            env: { PATH: '/nonexistent' },
            homeDir: replay.homeDir,
            hostGrokHomeDir: '/nonexistent/host-grok',
            hostToolServer: {
                openSession: () => ({
                    close: () => undefined,
                    mcp: {} as never,
                    replaceTools: () => undefined,
                }),
            },
            instructions: 'x',
            modelId: 'grok-4.6',
            processes: runtimeProcessOwner(runtime),
            reasoningEffort: 'default',
            tools: [],
            warm: { key: replay.homeDir, pool: replay.pool },
            workspaceDir: replay.workspaceDir,
        });
        const error = await driver
            .openSession({ resumeFrom: undefined, sessionId: 'agt-1' })
            .catch((caught: unknown) => caught);

        expect(String(error)).toContain('is not installed or not on PATH');
    } finally {
        await replay.cleanup();
    }
});
