import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';
import { stopSandboxProcesses } from './sandbox-process-owner.ts';
import { harnessSessionOwner } from './session-lifecycle.ts';
import {
    readAgentSessionState,
    resolveTurnSession,
    writeAgentSessionState,
} from './session-store.ts';

const liveTest = process.env.HAUS_RUN_LIVE_SESSION_SHUTDOWN_TEST === '1' ? test : test.skip;

liveTest(
    'Claude preserves conversation through a parked Computer shutdown',
    async () => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-session-shutdown-live-')));
        const runtime = makeDaemonRuntime();
        const nextRuntime = makeDaemonRuntime();
        const homeDir = join(root, 'home');
        await mkdir(join(root, 'workspace'), { recursive: true });
        const createAgent = (ownedRuntime: typeof runtime) =>
            new HarnessAgent({
                harness: createClaudeCode(),
                id: 'shutdown-live-test',
                permissionMode: 'allow-all',
                sandbox: createLocalTrustedSandboxProvider({
                    authProfiles: ['claude-code'],
                    env: { HOME: homeDir },
                    homeDir,
                    rootDir: root,
                    runtime: ownedRuntime,
                }),
                sandboxConfig: { workDir: 'workspace' },
            });
        try {
            const agent = createAgent(runtime);
            const owner = harnessSessionOwner(runtime);
            const lease = owner.begin(root);
            const session = await agent.createSession({
                sessionId: 'shutdown-live-test',
                abortSignal: AbortSignal.timeout(60_000),
            });
            lease.attach(session, (resumeFrom) =>
                agent.createSession({
                    sessionId: session.sessionId,
                    resumeFrom,
                    abortSignal: AbortSignal.timeout(15_000),
                })
            );
            await agent.generate({
                session,
                prompt: 'Remember this exact code for my next message: HARBOR_7429. Reply only SAVED. Do not use tools or write files.',
                abortSignal: AbortSignal.timeout(45_000),
            });
            const state = {
                ...resolveTurnSession(null, {
                    generation: 1,
                    modelId: 'default',
                    runtimeId: 'claude-code',
                }),
                runtimeSessionId: session.sessionId,
                resumeState: await lease.checkpoint(),
            };
            await writeAgentSessionState(root, state);
            lease.finish();
            await owner.close();
            await stopSandboxProcesses(runtime);
            const stored = await readAgentSessionState(root);
            expect(stored?.generation).toBe(1);
            expect(stored?.runtimeSessionId).toBe(session.sessionId);
            const nextAgent = createAgent(nextRuntime);
            const resumed = await nextAgent.createSession({
                sessionId: session.sessionId,
                resumeFrom: stored!.resumeState as Awaited<ReturnType<typeof session.stop>>,
                abortSignal: AbortSignal.timeout(20_000),
            });
            try {
                const reply = await nextAgent.generate({
                    session: resumed,
                    prompt: 'What exact code did I ask you to remember? Reply only with that code. Do not use tools.',
                    abortSignal: AbortSignal.timeout(45_000),
                });
                expect(reply.text.trim()).toBe('HARBOR_7429');
            } finally {
                await resumed.stop();
            }
        } finally {
            await Promise.allSettled([
                stopSandboxProcesses(runtime),
                stopSandboxProcesses(nextRuntime),
            ]);
            await Promise.allSettled([runtime.dispose(), nextRuntime.dispose()]);
            await rm(root, { force: true, recursive: true });
        }
    },
    180_000
);
