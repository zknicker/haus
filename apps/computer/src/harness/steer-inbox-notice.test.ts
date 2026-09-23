import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessV1 } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { makeLifecycleLoggerLayer } from '@haus/effect';
import { ManagedRuntime } from 'effect';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';
import { createNoticeDelivery, steerInboxNotice } from './steer-inbox-notice.ts';

const roots: string[] = [];
const runtime = makeDaemonRuntime();

afterAll(() => runtime.dispose());
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('real SDK reports unsupported steering instead of claiming an inbox notice was delivered', async () => {
    const fixture = await createTurn();
    try {
        expect(await steerInboxNotice(fixture.session, 'new inbox message', runtime)).toBe(false);
    } finally {
        await fixture.close();
    }
});

test('real SDK waits for runtime acknowledgment before reporting delivery', async () => {
    const accepted = Promise.withResolvers<void>();
    const submitted = Promise.withResolvers<string>();
    const fixture = await createTurn(async (text) => {
        submitted.resolve(text);
        await accepted.promise;
    });
    try {
        let settled = false;
        const delivery = steerInboxNotice(fixture.session, 'new inbox message', runtime).then(
            (value) => {
                settled = true;
                return value;
            }
        );
        expect(await submitted.promise).toBe('new inbox message');
        expect(settled).toBe(false);
        accepted.resolve();
        expect(await delivery).toBe(true);
    } finally {
        accepted.resolve();
        await fixture.close();
    }
});

test('runtime delivery failures defer the notice without failing the primary turn', async () => {
    const failure = new Error('bridge disconnected');
    const fixture = await createTurn(() => Promise.reject(failure));
    try {
        expect(await steerInboxNotice(fixture.session, 'new inbox message', runtime)).toBe(false);
    } finally {
        await fixture.close();
    }
});

test('a notice attempted after SDK completion stays pending without changing the turn outcome', async () => {
    const fixture = await createTurn();
    try {
        expect(await fixture.finish()).toBe('stop');
        expect(fixture.session.hasUnfinishedTurn()).toBe(false);
        expect(await steerInboxNotice(fixture.session, 'late inbox message', runtime)).toBe(false);
    } finally {
        await fixture.close();
    }
});

test('an injected notice logs its runtime, run, and wait since it was stored', async () => {
    const fixture = await createTurn(() => Promise.resolve());
    const logs: unknown[][] = [];
    const logged = (...values: readonly unknown[]) => logs.push([...values]);
    const loggingRuntime = ManagedRuntime.make(
        makeLifecycleLoggerLayer({
            debug: logged,
            error: logged,
            info: logged,
            log: logged,
            trace: logged,
            warn: logged,
        })
    );
    try {
        const agentRoot = await mkdtemp(join(tmpdir(), 'haus-notice-'));
        roots.push(agentRoot);
        const noticePath = join(agentRoot, 'runtime', 'pending-notice.json');
        await mkdir(join(agentRoot, 'runtime'));
        await writeFile(noticePath, `${JSON.stringify({ notice: 'new inbox message' })}\n`);
        const storedAt = new Date(Date.now() - 1500);
        await utimes(noticePath, storedAt, storedAt);
        const deliver = createNoticeDelivery(fixture.session, {
            agentId: 'agt_notice',
            agentRoot,
            runId: 'run_notice',
            runtime: loggingRuntime,
            runtimeId: 'codex',
        });

        expect(await deliver('new inbox message')).toBe(true);
        expect(logs).toHaveLength(1);
        const [message, fields] = logs[0] as [string, Record<string, unknown>];
        expect(message).toBe('Inbox notice injected into the running turn.');
        expect(fields).toMatchObject({
            agentId: 'agt_notice',
            event: 'inbox-notice-injected',
            runId: 'run_notice',
            runtimeId: 'codex',
        });
        expect(fields.elapsedMs).toBeGreaterThanOrEqual(1500);
        // A repeat of the delivered notice is not injected, so it logs nothing.
        expect(await deliver('new inbox message')).toBe(true);
        expect(logs).toHaveLength(1);
    } finally {
        await fixture.close();
        await loggingRuntime.dispose();
    }
});

async function createTurn(submitUserMessage?: (text: string) => Promise<void>) {
    const root = await mkdtemp(join(tmpdir(), 'haus-steering-'));
    roots.push(root);
    const started = Promise.withResolvers<void>();
    const finished = Promise.withResolvers<void>();
    const harness: HarnessV1 = {
        builtinTools: {},
        harnessId: 'steering-contract',
        specificationVersion: 'harness-v1',
        doStart: async (options) => {
            const state = {
                data: {},
                harnessId: 'steering-contract',
                specificationVersion: 'harness-v1',
                type: 'resume-session',
            } as const;
            return {
                isResume: false,
                sessionId: options.sessionId,
                doCompact: async () => undefined,
                doDestroy: async () => undefined,
                doDetach: async () => state,
                doStop: async () => state,
                doSuspendTurn: async () => ({ ...state, type: 'continue-turn' }),
                doContinueTurn: async () => ({
                    done: Promise.resolve(),
                    submitToolResult: async () => undefined,
                }),
                doPromptTurn: async (turn) => {
                    started.resolve();
                    return {
                        submitToolResult: async () => undefined,
                        ...(submitUserMessage ? { submitUserMessage } : {}),
                        done: finished.promise.then(() => {
                            turn.emit({
                                type: 'finish',
                                finishReason: { raw: undefined, unified: 'stop' },
                                totalUsage: {
                                    inputTokens: {
                                        cacheRead: undefined,
                                        cacheWrite: undefined,
                                        noCache: 1,
                                        total: 1,
                                    },
                                    outputTokens: { reasoning: undefined, text: 1, total: 1 },
                                    raw: undefined,
                                },
                            });
                        }),
                    };
                },
            };
        },
    };
    const agent = new HarnessAgent({
        harness,
        sandbox: createLocalTrustedSandboxProvider({ rootDir: root, runtime }),
    });
    const session = await agent.createSession();
    const result = await agent.stream({ prompt: 'start', session });
    const consumption = (async () => {
        for await (const part of result.fullStream) {
            void part;
        }
    })();
    await started.promise;
    return {
        session,
        finish: async () => {
            finished.resolve();
            await consumption;
            return await result.finishReason;
        },
        close: async () => {
            finished.resolve();
            await consumption;
            await session.destroy();
        },
    };
}
