import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as z from 'zod';
import { defineHostTool } from '../../host-tools/host-tool.ts';
import { startHostToolServer } from '../../host-tools/mcp-server.ts';
import type { RuntimeSession } from '../driver.ts';
import type { ClaudeResumeState } from '../resume-state.ts';
import type { TurnEvent } from '../turn-event.ts';
import { createClaudeCodeDriver } from './claude-code-driver.ts';
import { createClaudeWarmPool } from './claude-warm-pool.ts';

// A real Claude Code session through the driver: the pinned install, the host login, two warm
// turns, a steer mid-tool, a detach, and a cold resume. Prints time-to-first-event per turn.
//   HAUS_RUN_LIVE_CLAUDE_CODE_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-code-driver-live.test.ts
const liveTest = process.env.HAUS_RUN_LIVE_CLAUDE_CODE_TEST === '1' ? test : test.skip;
const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-claude-driver-live-')));
afterAll(() => rm(root, { force: true, recursive: true }));

liveTest(
    'a Claude Code session runs, steers, parks warm, and resumes cold',
    async () => {
        const homeDir = join(root, 'home');
        const workspaceDir = join(root, 'workspace');
        await mkdir(homeDir, { recursive: true });
        await mkdir(workspaceDir, { recursive: true });
        const server = startHostToolServer();
        const pool = createClaudeWarmPool();
        const calls: string[] = [];
        const tools = [
            defineHostTool({
                description: 'Runs a Haus command and returns its output.',
                execute: async (input) => {
                    calls.push(input.command);
                    return { text: `ran: ${input.command}`, type: 'text' };
                },
                inputSchema: z.object({ command: z.string() }),
                name: 'execute',
            }),
        ];
        const driver = () =>
            createClaudeCodeDriver({
                // A Computer's own env, not the env of whatever session runs this test.
                baseEnv: {
                    HOME: process.env.HOME,
                    PATH: process.env.PATH,
                    TMPDIR: process.env.TMPDIR,
                    USER: process.env.USER,
                },
                env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
                homeDir,
                hostToolServer: server,
                instructions:
                    'You are a Haus test Agent. Follow the user exactly; keep replies short.',
                modelId: 'claude-haiku-4-5',
                pool,
                reasoningEffort: 'low',
                tools,
                workspaceDir,
            });
        const timings: Record<string, { firstEventMs: number; openMs: number; turnMs: number }> =
            {};
        try {
            const fresh = await timedOpen(driver(), undefined);
            const one = await timedTurn(
                fresh.session,
                'Call the mcp__haus__execute tool with command "status", then reply with exactly: one'
            );
            timings.cold_fresh = { ...one.timing, openMs: fresh.openMs };
            expect(calls).toEqual(['status']);
            expect(textOf(one.events)).toContain('one');
            const parked = (await fresh.session.detach()) as ClaudeResumeState;

            const warm = await timedOpen(driver(), parked);
            const steered = await timedTurn(
                warm.session,
                'Use the Bash tool to run `sleep 6; echo first-done`, then reply with its output.',
                'Also include the word BANANA in your final reply.'
            );
            timings.warm_steer = { ...steered.timing, openMs: warm.openMs };
            expect(steered.steer).toEqual({ delivered: true });
            expect(textOf(steered.events)).toContain('BANANA');
            const parkedAgain = (await warm.session.detach()) as ClaudeResumeState;
            expect(pool.size).toBe(1);

            // Evict the warm process, as a Computer restart would.
            await (await driver().openSession({ resumeFrom: parkedAgain, sessionId: 's' })).stop();
            const cold = await timedOpen(driver(), parkedAgain);
            const recall = await timedTurn(
                cold.session,
                'Which word did I ask you to include? Reply with it only.'
            );
            timings.cold_resume = { ...recall.timing, openMs: cold.openMs };
            expect(textOf(recall.events).toUpperCase()).toContain('BANANA');
            expect(recall.events.at(-1)).toMatchObject({ type: 'turn-finish' });
            await cold.session.stop();
            process.stdout.write(`claude-code driver timings ${JSON.stringify(timings)}\n`);
        } finally {
            await server.stop();
        }
    },
    600_000
);

async function timedOpen(
    driver: ReturnType<typeof createClaudeCodeDriver>,
    resumeFrom: ClaudeResumeState | undefined
): Promise<{ openMs: number; session: RuntimeSession }> {
    const started = performance.now();
    const session = await driver.openSession({ resumeFrom, sessionId: 'agt_live-1' });
    return { openMs: Math.round(performance.now() - started), session };
}

async function timedTurn(session: RuntimeSession, prompt: string, steerText?: string) {
    const started = performance.now();
    const turn = await session.startTurn({ prompt, signal: new AbortController().signal });
    const events: TurnEvent[] = [];
    let firstEventMs = -1;
    let steer: unknown;
    for await (const event of turn.events) {
        if (firstEventMs < 0) {
            firstEventMs = Math.round(performance.now() - started);
        }
        events.push(event);
        if (steerText && steer === undefined && event.type === 'tool-call') {
            steer = await session.steer(steerText);
        }
    }
    return {
        events,
        steer,
        timing: { firstEventMs, turnMs: Math.round(performance.now() - started) },
    };
}

function textOf(events: TurnEvent[]): string {
    return events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : [])).join('');
}
