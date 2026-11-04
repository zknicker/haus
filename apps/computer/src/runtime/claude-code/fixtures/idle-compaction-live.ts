import { mkdir, mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHostToolServer } from '../../../host-tools/mcp-server.ts';
import type { RuntimeSession } from '../../driver.ts';
import type { IdleCompactionResult, IdleCompactionSnapshot } from '../../idle-compaction.ts';
import type { TurnEvent } from '../../turn-event.ts';
import { WarmProcessPool } from '../../warm-pool.ts';
import { createClaudeCodeDriver } from '../claude-code-driver.ts';

/**
 * A real Claude Code session behind the driver and a warm pool with idle compaction on, for the
 * live idle compaction tests. `dueInMs` shortens Claude Code's 54-minute timer; omit it to wait
 * for the real one. Every finished compaction resolves `compacted`.
 */
export async function openIdleCompactionLive(options: {
    dueInMs?: number;
    env?: Record<string, string>;
    idleMs?: number;
    modelId?: string;
}) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-claude-idle-compact-')));
    const homeDir = join(root, 'home');
    const workspaceDir = join(root, 'workspace');
    await mkdir(homeDir, { recursive: true });
    await mkdir(workspaceDir, { recursive: true });
    const server = startHostToolServer();
    const compactions = Promise.withResolvers<IdleCompactionResult>();
    const skips: string[] = [];
    const wakes: string[] = [];
    const dueInMs = options.dueInMs;
    const pool = new WarmProcessPool({
        idleCompaction: {
            ...(dueInMs === undefined
                ? {}
                : { dueAt: (snapshot: IdleCompactionSnapshot) => snapshot.activityAt + dueInMs }),
            hooks: {
                busy: () => false,
                compactable: () => true,
                failed: (_key, error) => compactions.reject(error),
                report: (_key, _identity, result) => {
                    compactions.resolve(result);
                    return Promise.resolve();
                },
                skipped: (_key, reason) => skips.push(reason),
            },
        },
        idleMs: options.idleMs,
        onCloseError: (error) => {
            throw error;
        },
    });
    pool.setIdleCompaction(true);
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
            env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...options.env },
            homeDir,
            hostToolServer: server,
            instructions: 'You are a Haus test Agent. Follow the user exactly; keep replies short.',
            modelId: options.modelId ?? 'claude-haiku-5-5',
            reasoningEffort: 'low',
            tools: [],
            warm: { key: root, pool },
            workspaceDir,
        });
    return {
        close: async () => {
            await pool.close();
            await server.stop();
        },
        compacted: compactions.promise,
        driver,
        pool,
        root,
        skips,
        wakes,
    };
}

export async function runLiveTurn(session: RuntimeSession, prompt: string): Promise<TurnEvent[]> {
    const turn = await session.startTurn({ prompt, signal: new AbortController().signal });
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
    }
    return events;
}

export function lastContextTokens(events: TurnEvent[]): number {
    const steps = events.flatMap((event) =>
        event.type === 'step-finish' && event.contextTokens !== null ? [event.contextTokens] : []
    );
    return steps.at(-1) ?? 0;
}

export function textOf(events: TurnEvent[]): string {
    return events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : [])).join('');
}

/** About 15 tokens a line: `lines` of filler only a compaction can drop, with `note` planted. */
export function ledger(label: string, lines: number, note?: { at: number; text: string }): string {
    return Array.from({ length: lines }, (_, index) =>
        note && index + 1 === note.at
            ? note.text
            : `${label} entry ${index + 1}: crate ${index + 1} holds ${(index * 7) % 97} brass fittings, bin ${(index * 13) % 41}.`
    ).join('\n');
}

export function liveLog(line: string) {
    process.stdout.write(`[idle-compaction] ${line}\n`);
}
