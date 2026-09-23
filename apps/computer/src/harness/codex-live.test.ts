import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { tool } from '@ai-sdk/provider-utils';
import * as z from 'zod';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { bridgeStoreDirForHost } from './bridge-bootstrap.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

// Opt-in: each case spends real Codex quota. Run with
// HAUS_RUN_LIVE_CODEX_TEST=1 bun test apps/computer/src/harness/codex-live.test.ts
const codexPreflight =
    process.env.HAUS_RUN_LIVE_CODEX_TEST === '1'
        ? await checkLocalCodex()
        : ({ available: false, reason: 'set HAUS_RUN_LIVE_CODEX_TEST=1' } as const);
const liveTest = codexPreflight.available ? test : test.skip;
const skipReason = codexPreflight.available ? '' : ` (${codexPreflight.reason})`;
const runtime = makeDaemonRuntime();
const model = 'gpt-5.6-luna';

afterAll(() => runtime.dispose());

liveTest(
    `codex-acp takes a steered message into an active turn${skipReason}`,
    async () => {
        await withCodexAgent({}, async (agent, session) => {
            const result = await agent.stream({
                abortSignal: AbortSignal.timeout(120_000),
                prompt: 'Run the shell command `sleep 5`. After it finishes, reply with exactly ORIGINAL and nothing else.',
                session,
            });
            let delivered = false;
            const toolNames: string[] = [];
            for await (const part of result.fullStream) {
                if (part.type === 'tool-call') {
                    toolNames.push(part.toolName);
                }
                if (part.type === 'tool-call' && !delivered) {
                    await session.experimental_steerTurn(
                        'Change the final reply to exactly INTERJECTED and nothing else.'
                    );
                    delivered = true;
                }
            }

            expect(delivered).toBe(true);
            // codex-acp's `exec_command` resolves to the common `bash` builtin Activity names.
            expect(toolNames).toContain('bash');
            expect((await result.text).trim()).toBe('INTERJECTED');
        });
    },
    180_000
);

liveTest(
    `codex-acp calls a Computer host tool over the harness MCP relay${skipReason}`,
    async () => {
        const tools = {
            haus_probe: tool({
                description: 'Returns the Haus probe code.',
                execute: () => Promise.resolve('PROBE-7731'),
                inputSchema: z.object({}),
            }),
        };
        await withCodexAgent({ tools }, async (agent, session) => {
            const result = await agent.generate({
                abortSignal: AbortSignal.timeout(120_000),
                prompt: 'Call the haus_probe tool once, then reply with exactly the code it returned and nothing else.',
                session,
            });

            expect(result.text.trim()).toBe('PROBE-7731');
        });
    },
    180_000
);

liveTest(
    `codex-acp resumes a stopped session with its conversation${skipReason}`,
    async () => {
        await withCodexAgent({}, async (agent, session) => {
            await agent.generate({
                abortSignal: AbortSignal.timeout(120_000),
                prompt: 'Remember this exact code for my next message: HARBOR_7429. Reply only SAVED. Do not use tools.',
                session,
            });
            // A stopped session is what a Computer restart or bootstrap refresh resumes.
            const resumed = await agent.createSession({ resumeFrom: await session.stop() });
            try {
                const result = await agent.generate({
                    abortSignal: AbortSignal.timeout(120_000),
                    prompt: 'What was the exact code? Reply with only the code. Do not use tools.',
                    session: resumed,
                });

                expect(resumed.isResume).toBe(true);
                expect(result.text.trim()).toBe('HARBOR_7429');
            } finally {
                await resumed.destroy();
            }
        });
    },
    180_000
);

async function withCodexAgent(
    options: { tools?: ConstructorParameters<typeof HarnessAgent>[0]['tools'] },
    run: (
        agent: HarnessAgent,
        session: Awaited<ReturnType<HarnessAgent['createSession']>>
    ) => Promise<void>
) {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-live-')));
    const homeDir = join(rootDir, 'home');
    await mkdir(join(rootDir, 'workspace'), { recursive: true });
    const agent = new HarnessAgent({
        harness: createHarnessForRuntime('codex', 'default', false, bridgeStoreDirForHost()),
        model,
        permissionMode: 'allow-all',
        sandbox: createLocalTrustedSandboxProvider({
            authProfiles: ['codex'],
            env: { CODEX_HOME: join(homeDir, '.codex'), HOME: homeDir },
            homeDir,
            rootDir,
            runtime,
        }),
        sandboxConfig: { workDir: 'workspace' },
        ...(options.tools ? { tools: options.tools } : {}),
    });
    const session = await agent.createSession();
    try {
        await run(agent, session);
    } finally {
        await session.destroy();
        await rm(rootDir, { force: true, recursive: true });
    }
}

async function checkLocalCodex(): Promise<
    { available: true } | { available: false; reason: string }
> {
    const executable = Bun.which('codex');
    if (!executable) {
        return { available: false, reason: 'local codex executable is missing' };
    }
    const subprocess = Bun.spawn([executable, 'login', 'status'], {
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        subprocess.exited,
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
    ]);
    return exitCode === 0 && /logged in/i.test(`${stdout}\n${stderr}`)
        ? { available: true }
        : { available: false, reason: 'local codex login is unavailable' };
}
