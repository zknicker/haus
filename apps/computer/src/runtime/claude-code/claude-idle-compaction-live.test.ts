import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHostToolServer } from '../../host-tools/mcp-server.ts';
import type { RuntimeSession } from '../driver.ts';
import type { ClaudeResumeState } from '../resume-state.ts';
import type { TurnEvent } from '../turn-event.ts';
import { type WarmIdentity, type WarmProcess, WarmProcessPool } from '../warm-pool.ts';
import { createClaudeCodeDriver } from './claude-code-driver.ts';
import { ClaudeConnection } from './claude-connection.ts';

// Does Claude Code's idle compaction (2.1.299+: a 200K+ session idle ~54 minutes, the
// `idleCompaction` setting, CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS) fire for a parked Haus
// session? One real session through the driver: a turn loads past the 100K floor, the process
// parks warm, the test waits past the idle threshold (Claude Code arms it at 90% of the 1h
// prompt-cache TTL and no env shortens it), then the next turn asks for a fact from the first.
// It prints every stdout line the parked process wrote while idle and passes only when a
// compaction happened and the next turn answered from the summary.
//   HAUS_RUN_LIVE_CLAUDE_IDLE_COMPACT_TEST=1 bun test apps/computer/src/runtime/claude-code/claude-idle-compaction-live.test.ts
// HAUS_IDLE_COMPACT_WAIT_MINUTES overrides the 57-minute wait.
const liveTest = process.env.HAUS_RUN_LIVE_CLAUDE_IDLE_COMPACT_TEST === '1' ? test : test.skip;
const waitMinutes = Number(process.env.HAUS_IDLE_COMPACT_WAIT_MINUTES ?? '57');
const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-claude-idle-compact-')));
afterAll(() => rm(root, { force: true, recursive: true }));

/** Records what a parked process writes while no Haus turn holds it. */
class ObservedPool extends WarmProcessPool {
    readonly idleLines: string[] = [];
    private stopObserving: (() => void) | null = null;

    override park(key: string, identity: WarmIdentity, process: WarmProcess): Promise<void> {
        if (process instanceof ClaudeConnection) {
            this.stopObserving = process.process.onLine((line) => this.idleLines.push(line));
        }
        return super.park(key, identity, process);
    }

    override claim<Process extends WarmProcess>(
        key: string,
        want: WarmIdentity,
        is: (process: WarmProcess) => process is Process
    ): Promise<Process | undefined> {
        this.stopObserving?.();
        this.stopObserving = null;
        return super.claim(key, want, is);
    }
}

liveTest(
    'a parked Claude Code session compacts while idle and the next turn answers from the summary',
    async () => {
        const homeDir = join(root, 'home');
        const workspaceDir = join(root, 'workspace');
        await mkdir(homeDir, { recursive: true });
        await mkdir(workspaceDir, { recursive: true });
        const server = startHostToolServer();
        // The pool's own idle close must not end the process before Claude Code's fires.
        const pool = new ObservedPool({
            idleMs: (waitMinutes + 30) * 60_000,
            onCloseError: (error) => {
                throw error;
            },
        });
        const wakes: string[] = [];
        const driver = () =>
            createClaudeCodeDriver({
                background: {
                    absorbed: () => wakes.push('absorbed'),
                    changed: () => undefined,
                    lost: () => wakes.push('lost'),
                    wake: () => wakes.push('wake'),
                },
                baseEnv: {
                    HOME: process.env.HOME,
                    PATH: process.env.PATH,
                    TMPDIR: process.env.TMPDIR,
                    USER: process.env.USER,
                },
                // Claude Code floors it at 100K; set low so only that floor applies.
                env: {
                    CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS: '1',
                    PATH: process.env.PATH ?? '/usr/bin:/bin',
                },
                homeDir,
                hostToolServer: server,
                instructions:
                    'You are a Haus test Agent. Follow the user exactly; keep replies short.',
                modelId: 'claude-haiku-5-5',
                warm: { key: root, pool },
                reasoningEffort: 'low',
                tools: [],
                workspaceDir,
            });
        try {
            const first = await driver().openSession({
                resumeFrom: undefined,
                sessionId: 'agt_idle-compact',
            });
            const loaded = await runTurn(first, loadPrompt());
            const loadedContext = lastContextTokens(loaded);
            log(`turn 1 context ${loadedContext} tokens`);
            expect(loadedContext).toBeGreaterThan(100_000);
            const parked = (await first.detach()) as ClaudeResumeState;

            for (let minute = 1; minute <= waitMinutes; minute += 1) {
                await Bun.sleep(60_000);
                const boundary = await transcriptHasCompactBoundary(homeDir);
                log(
                    `idle ${minute}/${waitMinutes} min: ${pool.idleLines.length} idle lines, transcript compact boundary: ${boundary}`
                );
            }
            log(`idle lines:\n${pool.idleLines.map((line) => line.slice(0, 300)).join('\n')}`);

            const second = await driver().openSession({
                resumeFrom: parked,
                sessionId: 'agt_idle-compact',
            });
            const recall = await runTurn(
                second,
                'What is the vault word from my first message? Reply with the word only.'
            );
            const recallContext = lastContextTokens(recall);
            const compactedWhileIdle = pool.idleLines.some((line) => line.includes('compact'));
            const boundary = await transcriptHasCompactBoundary(homeDir);
            log(
                JSON.stringify({
                    boundary,
                    compactedWhileIdle,
                    loadedContext,
                    recallContext,
                    reply: textOf(recall),
                    wakes,
                })
            );
            await second.stop();
            // A compaction is never a sub-agent report: nothing may ask for a wake.
            expect(wakes).toEqual([]);
            expect(boundary).toBe(true);
            expect(recallContext).toBeLessThan(loadedContext / 2);
            expect(textOf(recall).toUpperCase()).toContain('PERSIMMON');
        } finally {
            await pool.close();
            await server.stop();
        }
    },
    (waitMinutes + 15) * 60_000
);

/** About 120K tokens: a vault word to recall, then filler only a compaction can drop. */
function loadPrompt(): string {
    const ledger = Array.from(
        { length: 8000 },
        (_, index) =>
            `Ledger entry ${index + 1}: crate ${index + 1} holds ${(index * 7) % 97} brass fittings.`
    ).join('\n');
    return `The vault word is PERSIMMON. Remember it.\n\n${ledger}\n\nReply with exactly: loaded`;
}

async function runTurn(session: RuntimeSession, prompt: string): Promise<TurnEvent[]> {
    const turn = await session.startTurn({ prompt, signal: new AbortController().signal });
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
    }
    expect(events.at(-1)).toMatchObject({ type: 'turn-finish' });
    return events;
}

function lastContextTokens(events: TurnEvent[]): number {
    const steps = events.flatMap((event) =>
        event.type === 'step-finish' && event.contextTokens !== null ? [event.contextTokens] : []
    );
    return steps.at(-1) ?? 0;
}

async function transcriptHasCompactBoundary(homeDir: string): Promise<boolean> {
    const projects = join(homeDir, '.claude', 'projects');
    let files: string[];
    try {
        files = (await readdir(projects, { recursive: true })).filter((file) =>
            file.endsWith('.jsonl')
        );
    } catch {
        return false;
    }
    for (const file of files) {
        if ((await readFile(join(projects, file), 'utf8')).includes('"compact_boundary"')) {
            return true;
        }
    }
    return false;
}

function textOf(events: TurnEvent[]): string {
    return events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : [])).join('');
}

function log(line: string) {
    process.stdout.write(`[idle-compaction] ${line}\n`);
}
