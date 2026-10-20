import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { defineHostTool } from '../../host-tools/host-tool.ts';
import { startHostToolServer } from '../../host-tools/mcp-server.ts';
import type { RuntimeSession } from '../driver.ts';
import type { TurnEvent } from '../turn-event.ts';
import { createCodexDriver } from './codex-driver.ts';
import { resolvePinnedCodex } from './codex-executable.ts';
import { testWarmPool } from './testing/replay-driver.ts';

// Opt-in: spends real Codex quota and installs the pinned Codex CLI on first run.
// HAUS_RUN_LIVE_CODEX_DRIVER_TEST=1 bun test apps/computer/src/runtime/codex/codex-driver-live.test.ts
const preflight =
    process.env.HAUS_RUN_LIVE_CODEX_DRIVER_TEST === '1'
        ? await checkCodexLogin()
        : ({ available: false, reason: 'set HAUS_RUN_LIVE_CODEX_DRIVER_TEST=1' } as const);
const liveTest = preflight.available ? test : test.skip;
const skipReason = preflight.available ? '' : ` (${preflight.reason})`;
const model = process.env.HAUS_LIVE_CODEX_MODEL ?? 'gpt-5.6-luna';
const server = startHostToolServer();

afterAll(() => server.stop());

liveTest(
    `the Codex driver runs, steers, detaches, and resumes a real session${skipReason}`,
    async () => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-driver-live-')));
        await mkdir(join(root, 'workspace'));
        const probe = defineHostTool({
            description: 'Returns the Haus probe code.',
            execute: () => Promise.resolve({ text: 'PROBE-7731', type: 'text' }),
            inputSchema: z.object({}),
            name: 'haus_probe',
        });
        const driver = () =>
            createCodexDriver({
                env: {},
                warm: { key: root, pool: testWarmPool },
                homeDir: join(root, 'home'),
                hostToolServer: server,
                instructions: 'You are a Haus test Agent. Follow the user exactly.',
                modelId: model,
                reasoningEffort: 'low',
                tools: [probe],
                workspaceDir: join(root, 'workspace'),
            });
        let session: RuntimeSession | undefined;
        try {
            const opened = Date.now();
            session = await driver().openSession({ resumeFrom: undefined, sessionId: 'live' });
            const openMs = Date.now() - opened;
            const first = await runTurn(
                session,
                'Call the haus_probe tool once, then reply with exactly the code it returned and nothing else.'
            );
            expect(first.text.trim()).toBe('PROBE-7731');
            expect(first.toolNames).toContain('haus_probe');

            const second = await runTurn(
                session,
                'Run the shell command `sleep 5`. After it finishes, reply with exactly ORIGINAL and nothing else.',
                'Change the final reply to exactly INTERJECTED and nothing else.'
            );
            expect(second.steered).toEqual({ delivered: true });
            expect(second.text.trim()).toBe('INTERJECTED');

            const state = await session.detach();
            const warmed = Date.now();
            session = await driver().openSession({ resumeFrom: state, sessionId: 'live' });
            const warmOpenMs = Date.now() - warmed;
            expect(session.isResume).toBe(true);
            const third = await runTurn(
                session,
                'What code did the haus_probe tool return earlier? Reply with only the code. Do not use tools.'
            );
            expect(third.text.trim()).toBe('PROBE-7731');

            const stopped = await session.stop();
            const cold = Date.now();
            session = await driver().openSession({ resumeFrom: stopped, sessionId: 'live' });
            const coldOpenMs = Date.now() - cold;
            const fourth = await runTurn(
                session,
                'Reply with only the word you were told to make your final reply two messages ago. Do not use tools.'
            );
            expect(fourth.text.trim()).toBe('INTERJECTED');
            console.log(
                JSON.stringify({
                    coldOpenMs,
                    firstEventMs: [first, second, third, fourth].map((turn) => turn.firstEventMs),
                    openMs,
                    turnMs: [first, second, third, fourth].map((turn) => turn.turnMs),
                    warmOpenMs,
                })
            );
        } finally {
            await session?.destroy();
            await rm(root, { force: true, recursive: true });
        }
    },
    300_000
);

async function runTurn(session: RuntimeSession, prompt: string, steer?: string) {
    const started = Date.now();
    const turn = await session.startTurn({ prompt, signal: AbortSignal.timeout(120_000) });
    let firstEventMs = -1;
    let text = '';
    let steered: Awaited<ReturnType<RuntimeSession['steer']>> | undefined;
    const toolNames: string[] = [];
    const errors: unknown[] = [];
    for await (const event of turn.events as AsyncIterable<TurnEvent>) {
        if (firstEventMs < 0) {
            firstEventMs = Date.now() - started;
        }
        if (event.type === 'text-delta') {
            text += event.text;
        }
        if (event.type === 'error') {
            errors.push(event.error);
        }
        if (event.type === 'tool-call') {
            toolNames.push(event.toolName);
            if (steer && !steered) {
                steered = await session.steer(steer);
            }
        }
    }
    await turn.settle();
    expect(errors).toEqual([]);
    return { firstEventMs, steered, text, toolNames, turnMs: Date.now() - started };
}

async function checkCodexLogin(): Promise<
    { available: true } | { available: false; reason: string }
> {
    const codex = await resolvePinnedCodex();
    const subprocess = Bun.spawn([codex.path, 'login', 'status'], {
        stderr: 'pipe',
        stdin: 'ignore',
        stdout: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        subprocess.exited,
        new Response(subprocess.stdout).text(),
        new Response(subprocess.stderr).text(),
    ]);
    return exitCode === 0 && /logged in/iu.test(`${stdout}\n${stderr}`)
        ? { available: true }
        : { available: false, reason: 'local codex login is unavailable' };
}
