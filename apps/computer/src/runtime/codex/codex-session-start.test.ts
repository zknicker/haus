// Ported from botiverse/raft-source packages/daemon/src/drivers/codex.test.ts (FSL-1.1-ALv2)
import { describe, expect, test } from 'bun:test';
import { isRuntimeResumeRejection } from '../resume-rejected.ts';
import { resumeThreadId } from './codex-driver.ts';
import { CodexResumeRejectedError, CodexThreadBusyError } from './codex-errors.ts';
import { FakeAppServer } from './testing/fake-app-server.ts';
import { flush, labels, openFake, startFakeTurn, turnStarted } from './testing/session-harness.ts';

const resumeFrom = { runtime: 'codex', threadId: 'existing-thread-1', version: 1 } as const;
const refusal = (message: string) => () => ({ error: { code: -32_000, message } });

describe('Codex session start', () => {
    test('a fresh session starts a thread, then the turn on that thread', async () => {
        const { fake, session } = await openFake();
        await startFakeTurn(fake, session, 'initial prompt');
        expect(fake.methods()).toEqual([
            'initialize',
            'initialized',
            'config/read',
            'thread/start',
            'turn/start',
        ]);
        expect(fake.request('initialize')?.params).toMatchObject({
            capabilities: { experimentalApi: true },
            clientInfo: { name: 'haus-computer' },
        });
        expect(fake.request('turn/start')?.params).toEqual({
            input: [{ text: 'initial prompt', text_elements: [], type: 'text' }],
            // App-server turns default to no reasoning summary; Activity reads the summaries.
            summary: 'auto',
            threadId: 'thread-1',
        });
        expect(session.isResume).toBe(false);
        expect(session.sessionId).toBe('thread-1');
    });

    test('resume targets the saved thread, excludes returned history, and starts there', async () => {
        const { fake, session } = await openFake(new FakeAppServer({}, 'existing-thread-1'), {
            resumeFrom,
        });
        await startFakeTurn(fake, session);
        expect(fake.methods()).toEqual([
            'initialize',
            'initialized',
            'config/read',
            'thread/resume',
            'turn/start',
        ]);
        expect(fake.request('thread/resume')?.params).toMatchObject({
            approvalPolicy: 'never',
            developerInstructions: 'You are a Haus test Agent. Follow the user exactly.',
            excludeTurns: true,
            sandbox: 'danger-full-access',
            threadId: 'existing-thread-1',
        });
        expect(fake.request('turn/start')?.params.threadId).toBe('existing-thread-1');
        expect(session.isResume).toBe(true);
    });

    test('a missing rollout is a resume rejection, never a silent fresh thread', async () => {
        const fake = new FakeAppServer({
            'thread/resume': refusal('no rollout found for thread id existing-thread-1'),
        });
        const error = await openFake(fake, { resumeFrom }).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(CodexResumeRejectedError);
        expect((error as CodexResumeRejectedError).codexReason).toBe('missing-rollout');
        expect((error as CodexResumeRejectedError).reason).toBe('missing');
        expect(isRuntimeResumeRejection(error)).toBe(true);
        expect(fake.methods()).not.toContain('thread/start');
    });

    test('an active writer on the thread is retryable, never a rejection that drops it', async () => {
        const fake = new FakeAppServer({
            'thread/resume': refusal('thread existing-thread-1 already has an active writer'),
        });
        const error = await openFake(fake, { resumeFrom }).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(CodexThreadBusyError);
        expect(isRuntimeResumeRejection(error)).toBe(false);
    });

    test('an archived thread is unarchived and resumed as the same thread (task #14)', async () => {
        let resumes = 0;
        const fake = new FakeAppServer(
            {
                'thread/resume': () =>
                    resumes++ === 0
                        ? {
                              error: {
                                  message:
                                      'session existing-thread-1 is archived. Run `codex unarchive`',
                              },
                          }
                        : { result: { thread: { id: 'existing-thread-1' } } },
            },
            'existing-thread-1'
        );
        const { session } = await openFake(fake, { resumeFrom });
        expect(fake.methods()).toEqual([
            'initialize',
            'initialized',
            'config/read',
            'thread/resume',
            'thread/unarchive',
            'thread/resume',
        ]);
        expect(fake.request('thread/unarchive')?.params).toEqual({ threadId: 'existing-thread-1' });
        expect(session.sessionId).toBe('existing-thread-1');
    });

    test('an archived thread that will not unarchive is a resume rejection (task #14)', async () => {
        const fake = new FakeAppServer({
            'thread/resume': refusal('session existing-thread-1 is archived'),
            'thread/unarchive': refusal('cannot unarchive'),
        });
        const error = await openFake(fake, { resumeFrom }).catch((caught: unknown) => caught);
        expect((error as CodexResumeRejectedError).reason).toBe('archived');
        expect(isRuntimeResumeRejection(error)).toBe(true);
    });

    test('a resume permission error is a startup failure, not a rejection', async () => {
        const fake = new FakeAppServer({
            'thread/resume': refusal('No permission to access thread forbidden-thread-1'),
        });
        const error = await openFake(fake, { resumeFrom }).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(CodexResumeRejectedError);
        expect(isRuntimeResumeRejection(error)).toBe(false);
        expect(fake.methods()).toEqual([
            'initialize',
            'initialized',
            'config/read',
            'thread/resume',
        ]);
    });

    test('initialize, thread start, and turn start errors fail startup', async () => {
        const initialize = await openFake(
            new FakeAppServer({ initialize: refusal('initialize failed') })
        ).catch((caught: unknown) => caught);
        expect((initialize as Error).message).toBe('initialize failed: initialize failed');
        const start = await openFake(
            new FakeAppServer({ 'thread/start': refusal('thread start failed') })
        ).catch((caught: unknown) => caught);
        expect((start as Error).message).toBe('thread/start failed: thread start failed');
        const { fake, session } = await openFake(
            new FakeAppServer({ 'turn/start': refusal('turn start failed') })
        );
        const turn = await startFakeTurn(fake, session).catch((caught: unknown) => caught);
        expect((turn as Error).message).toBe('turn/start failed: turn start failed');
    });

    test('an initialize response without the userAgent handshake fails closed', async () => {
        const error = await openFake(
            new FakeAppServer({ initialize: () => ({ result: {} }) })
        ).catch((caught: unknown) => caught);
        expect((error as Error).message).toContain('userAgent');
    });

    test('the first turn waits for the host-tool MCP server', async () => {
        const fake = new FakeAppServer({
            'thread/start': () => ({ result: { thread: { id: 'thread-1' } } }),
        });
        const { session } = await openFake(fake);
        const starting = startFakeTurn(fake, session);
        await flush();
        expect(fake.methods()).not.toContain('turn/start');
        fake.notify('mcpServer/startupStatus/updated', { name: 'haus', status: 'ready' });
        await starting;
        expect(fake.methods()).toContain('turn/start');
    });

    test('a failed host-tool MCP server degrades to a turn with a visible warning', async () => {
        const fake = new FakeAppServer({
            'thread/start': () => ({ result: { thread: { id: 'thread-1' } } }),
        });
        const { session } = await openFake(fake);
        const starting = startFakeTurn(fake, session);
        await flush();
        fake.notify('mcpServer/startupStatus/updated', {
            error: 'connection refused',
            name: 'haus',
            status: 'failed',
        });
        const turn = await starting;
        turnStarted(fake, turn.turnId);
        await flush();
        expect(labels(turn.events)[0]).toBe(
            'session-failure:warning:host-tools:Haus host tools are unavailable to Codex: connection refused'
        );
    });

    test('model and reasoning effort ride the thread request', async () => {
        const { fake } = await openFake(new FakeAppServer(), {
            overrides: { modelId: 'gpt-5.5', reasoningEffort: 'xhigh' },
        });
        expect(fake.request('thread/start')?.params).toMatchObject({
            config: { model_reasoning_effort: 'xhigh' },
            model: 'gpt-5.5',
        });
        const defaulted = await openFake(new FakeAppServer(), {
            overrides: { reasoningEffort: 'default' },
        });
        expect(
            defaulted.fake.request('thread/start')?.params.config?.model_reasoning_effort
        ).toBeUndefined();
    });

    test('a legacy AI SDK harness state resumes the codex-acp session id as the thread', () => {
        expect(
            resumeThreadId({
                data: { acpSessionId: 'acp-thread' },
                harnessId: 'codex',
                type: 'resume-session',
            })
        ).toBe('acp-thread');
        const rejection = (state: Parameters<typeof resumeThreadId>[0]) => {
            try {
                resumeThreadId(state);
            } catch (error) {
                return isRuntimeResumeRejection(error) ? (error as Error).message : null;
            }
            return null;
        };
        expect(rejection({ data: {}, harnessId: 'codex' })).toMatch(/holds no codex/u);
        expect(rejection({ claudeSessionId: 'c', runtime: 'claude-code', version: 1 })).toMatch(
            /belongs to claude-code/u
        );
    });
});
