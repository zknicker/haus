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
import { readTokenUsage } from './token-usage.ts';

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
            const observedAt = new Map<string, number>();
            const durations: number[] = [];
            for await (const part of result.fullStream) {
                if (part.type === 'tool-call') {
                    toolNames.push(part.toolName);
                    observedAt.set(part.toolCallId, Date.now());
                }
                if (part.type === 'tool-result' && part.toolName === 'bash') {
                    durations.push(Date.now() - (observedAt.get(part.toolCallId) ?? Date.now()));
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
            // The call surfaces when `sleep 5` starts, not with its result.
            expect(Math.max(...durations)).toBeGreaterThan(3000);
            expect((await result.text).trim()).toBe('INTERJECTED');
        });
    },
    180_000
);

liveTest(
    `codex-acp names an apply_patch step and counts every model request${skipReason}`,
    async () => {
        await withCodexAgent({}, async (agent, session) => {
            const result = await agent.stream({
                abortSignal: AbortSignal.timeout(120_000),
                prompt: 'Use your apply_patch tool to create notes.txt containing the word hi. Then reply with exactly DONE and nothing else.',
                session,
            });
            const toolNames: string[] = [];
            let lastRequestTokens = 0;
            let turnUsage: ReturnType<typeof readTokenUsage> = null;
            let turnTokens = 0;
            for await (const part of result.fullStream) {
                if (part.type === 'tool-call') {
                    toolNames.push(part.toolName);
                }
                if (
                    part.type === 'raw' &&
                    isRecord(part.rawValue) &&
                    'stopReason' in part.rawValue
                ) {
                    lastRequestTokens = readQuotaTokens(part.rawValue);
                }
                if (part.type === 'finish') {
                    turnUsage = readTokenUsage(part.totalUsage);
                    const raw = part.totalUsage.raw;
                    turnTokens = typeof raw?.totalTokens === 'number' ? raw.totalTokens : 0;
                }
            }

            expect((await result.text).trim()).toBe('DONE');
            expect(toolNames).toContain('apply_patch');
            expect(toolNames.filter((name) => name.startsWith('acp_tool_'))).toEqual([]);
            // Input includes cached input, so the processed total is Codex's own turn total.
            const usage = turnUsage ?? {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
            };
            expect(usage.inputTokens).toBeGreaterThan(1000);
            expect(usage.inputTokens).toBeGreaterThanOrEqual(usage.cacheReadTokens);
            expect(usage.totalTokens).toBe(turnTokens);
            // The patch call and the reply are separate model requests; the turn counts both.
            expect(lastRequestTokens).toBeGreaterThan(0);
            expect(turnTokens).toBeGreaterThan(lastRequestTokens);
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

/** codex-acp's own last-request count, which the prompt response still carries. */
function readQuotaTokens(response: Record<string, unknown>): number {
    const meta = isRecord(response._meta) ? response._meta : {};
    const quota = isRecord(meta.quota) ? meta.quota : {};
    const count = isRecord(quota.token_count) ? quota.token_count : {};
    return typeof count.totalTokens === 'number' ? count.totalTokens : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
