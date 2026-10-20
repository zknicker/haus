import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DaemonRuntime } from '../../../daemon-runtime.ts';
import { sandboxProcessOwner } from '../../../harness/sandbox-process-owner.ts';
import { startHostToolServer } from '../../../host-tools/mcp-server.ts';
import type { RuntimeTurn } from '../../driver.ts';
import type { TurnEvent } from '../../turn-event.ts';
import { WarmProcessPool } from '../../warm-pool.ts';
import { createGrokDriver } from '../grok-driver.ts';
import { echoHostTool } from './echo-host-tool.ts';
import { parseFixture } from './fixture-format.ts';

/**
 * Test support: a Grok driver whose `grok` is `replay-grok.ts` playing one recorded fixture, in a
 * throwaway Agent root. `messages()` returns what the driver sent, as the replay logged it.
 */
export async function replayDriver(fixture: string, runtime: DaemonRuntime) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-grok-replay-')));
    const homeDir = join(root, 'home');
    const workspaceDir = join(root, 'workspace');
    await mkdir(workspaceDir, { recursive: true });
    await writeFile(join(workspaceDir, 'notes.txt'), 'alpha\nbeta\n');
    const logPath = join(root, 'replay.log');
    const fixturePath = join(import.meta.dir, `${fixture}.jsonl`);
    const hostToolServer = startHostToolServer();
    const pool = new WarmProcessPool({
        onCloseError: (error) => {
            throw error;
        },
    });
    const driver = createGrokDriver({
        command: [process.execPath, join(import.meta.dir, 'replay-grok.ts'), fixturePath],
        env: { PATH: process.env.PATH ?? '', REPLAY_LOG: logPath, XAI_API_KEY: 'xai-replay' },
        homeDir,
        hostGrokHomeDir: join(root, 'no-host-grok'),
        hostHomeDir: join(root, 'host'),
        hostToolServer,
        instructions: 'Replay instructions.\n',
        modelId: 'grok-4.6',
        reasoningEffort: 'low',
        processes: sandboxProcessOwner(runtime),
        warm: { key: root, pool },
        tools: [echoHostTool],
        workspaceDir,
    });
    const frames = parseFixture(await readFile(fixturePath, 'utf8'));
    return {
        cleanup: async () => {
            await pool.close();
            await hostToolServer.stop();
            await rm(root, { force: true, recursive: true });
        },
        driver,
        pool,
        homeDir,
        /** The Grok session id the fixture recorded. */
        recordedSessionId(): string {
            for (const frame of frames) {
                if (frame.dir === 'in') {
                    const result = frame.message.result as { sessionId?: unknown } | undefined;
                    const params = frame.message.params as { sessionId?: unknown } | undefined;
                    const id = result?.sessionId ?? params?.sessionId;
                    if (typeof id === 'string') {
                        return id;
                    }
                }
            }
            throw new Error(`${fixture} records no session id.`);
        },
        async messages(): Promise<Record<string, unknown>[]> {
            const text = await readFile(logPath, 'utf8').catch(() => '');
            return text
                .split('\n')
                .filter(Boolean)
                .map((line) => JSON.parse(line));
        },
        workspaceDir,
    };
}

export async function collect(
    turn: RuntimeTurn,
    onEvent?: (event: TurnEvent) => void
): Promise<TurnEvent[]> {
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
        onEvent?.(event);
    }
    return events;
}

/** The events a consumer reads, without liveness and streamed text. */
export function significant(events: readonly TurnEvent[]): TurnEvent[] {
    return events.filter((event) => event.type !== 'progress' && event.type !== 'text-delta');
}

export function text(events: readonly TurnEvent[]): string {
    return events.map((event) => (event.type === 'text-delta' ? event.text : '')).join('');
}
