import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHostToolServer } from '../../host-tools/mcp-server.ts';
import type { BackgroundWork } from '../background-work.ts';
import type { RuntimeSession } from '../driver.ts';
import type { ClaudeResumeState } from '../resume-state.ts';
import type { TurnEvent } from '../turn-event.ts';
import { WarmProcessPool } from '../warm-pool.ts';
import { createClaudeCodeDriver } from './claude-code-driver.ts';

// Background sub-agents against the real pinned CLI (specs/runtime-drivers.md "Background
// work"): a turn starts one and ends at once, a new message is answered while it runs, and
// Claude Code's own completion turn is adopted by a wake turn that writes no prompt.
//   HAUS_RUN_LIVE_CLAUDE_CODE_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-background-live.test.ts
const liveTest = process.env.HAUS_RUN_LIVE_CLAUDE_CODE_TEST === '1' ? test : test.skip;
const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-claude-background-live-')));
afterAll(() => rm(root, { force: true, recursive: true }));

const subagentSeconds = 30;

liveTest(
    'a background sub-agent outlives its turn, the Agent stays reachable, and its report wakes a turn',
    async () => {
        const homeDir = join(root, 'home');
        const workspaceDir = join(root, 'workspace');
        await mkdir(homeDir, { recursive: true });
        await mkdir(workspaceDir, { recursive: true });
        const pool = new WarmProcessPool({
            onCloseError: (error) => {
                throw error;
            },
        });
        const changes: BackgroundWork[] = [];
        const woke = Promise.withResolvers<number>();
        const started = performance.now();
        const server = startHostToolServer();
        const driver = () =>
            createClaudeCodeDriver({
                background: {
                    absorbed: () => {
                        throw new Error('Only the wake turn adopts in this flow.');
                    },
                    changed: (_root, work) => changes.push(work),
                    lost: () => undefined,
                    wake: () => woke.resolve(performance.now() - started),
                },
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
                reasoningEffort: 'low',
                tools: [],
                warm: { key: root, pool },
                workspaceDir,
            });
        const timings: Record<string, number> = {};
        try {
            const first = await driver().openSession({ resumeFrom: undefined, sessionId: 's' });
            const start = await timedTurn(
                first,
                `Use the Agent tool with run_in_background set to true (subagent_type "general-purpose") to have a sub-agent run \`python3 -c "import time; time.sleep(${subagentSeconds})"; echo bg-ok\` with Bash and report its output. Do not wait for it: as soon as it has started, reply with exactly: started`
            );
            timings.startTurnMs = start.ms;
            expect(start.events.at(-1)).toMatchObject({ type: 'turn-finish' });
            expect(textOf(start.events)).toContain('started');
            expect(changes.some((work) => work.subagents === 1)).toBe(true);
            // The turn ended well before the sub-agent could have.
            expect(start.ms).toBeLessThan(subagentSeconds * 1000);
            const parked = (await first.detach()) as ClaudeResumeState;

            // A new message is answered while the sub-agent still runs, on the same process.
            const second = await driver().openSession({ resumeFrom: parked, sessionId: 's' });
            const pong = await timedTurn(second, 'Reply with exactly: pong');
            timings.reachableTurnMs = pong.ms;
            expect(textOf(pong.events)).toContain('pong');
            expect(changes.at(-1)?.subagents).toBe(1);
            const parkedAgain = (await second.detach()) as ClaudeResumeState;
            expect(pool.size).toBe(1);

            // Claude Code reports the finished sub-agent in a turn of its own; a wake adopts it.
            timings.wakeAfterMs = Math.round(await woke.promise);
            const third = await driver().openSession({ resumeFrom: parkedAgain, sessionId: 's' });
            const report = await timedTurn(third, 'This wake prompt is never written.', true);
            timings.wakeTurnMs = report.ms;
            expect(report.events.at(-1)).toMatchObject({ type: 'turn-finish' });
            expect(textOf(report.events).toLowerCase()).toContain('bg-ok');
            expect(changes.at(-1)).toEqual({ subagents: 0, tasks: 0 });
            await third.stop();
            process.stdout.write(`claude-code background timings ${JSON.stringify(timings)}\n`);
        } finally {
            await pool.close();
            await server.stop();
        }
    },
    600_000
);

async function timedTurn(session: RuntimeSession, prompt: string, wake = false) {
    const begun = performance.now();
    const turn = await session.startTurn({ prompt, signal: new AbortController().signal, wake });
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
    }
    return { events, ms: Math.round(performance.now() - begun) };
}

function textOf(events: TurnEvent[]): string {
    return events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : [])).join('');
}
