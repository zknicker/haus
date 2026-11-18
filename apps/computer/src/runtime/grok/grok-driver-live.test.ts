import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDaemonRuntime } from '../../daemon-runtime.ts';
import { startHostToolServer } from '../../host-tools/mcp-server.ts';
import type { RuntimeSession, SteerResult } from '../driver.ts';
import { runtimeProcessOwner } from '../process-registry.ts';
import type { TurnEvent } from '../turn-event.ts';
import { WarmProcessPool } from '../warm-pool.ts';
import { echoHostTool } from './fixtures/echo-host-tool.ts';
import { createGrokDriver } from './grok-driver.ts';

// Opt-in: drives the installed, logged-in `grok` through the production driver.
// HAUS_RUN_LIVE_GROK_DRIVER_TEST=1 bun test apps/computer/src/runtime/grok/grok-driver-live.test.ts
// Two turns with a mid-tool interjection and a real host-tool call, a warm detach/resume, and a
// cold resume after stop. HAUS_LIVE_GROK_MODEL picks the model (default grok-4.6).
const liveTest =
    process.env.HAUS_RUN_LIVE_GROK_DRIVER_TEST === '1' && Bun.which('grok') ? test : test.skip;
const runtime = makeDaemonRuntime();
const hostToolServer = startHostToolServer();
const warmPool = new WarmProcessPool({
    onCloseError: (error) => {
        throw error;
    },
});
const roots: string[] = [];

afterAll(async () => {
    await warmPool.close();
    await hostToolServer.stop();
    await runtime.dispose();
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

liveTest(
    'installed Grok: interjection, host tool, warm detach and cold resume keep the conversation',
    async () => {
        const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-grok-live-')));
        roots.push(root);
        const workspaceDir = join(root, 'workspace');
        await mkdir(workspaceDir, { recursive: true });
        const driver = () =>
            createGrokDriver({
                env: { PATH: process.env.PATH ?? '' },
                homeDir: join(root, 'home'),
                hostToolServer,
                instructions:
                    'You are a Haus test agent. Follow instructions exactly; keep replies short.\n',
                modelId: process.env.HAUS_LIVE_GROK_MODEL ?? 'grok-4.6',
                reasoningEffort: 'low',
                processes: runtimeProcessOwner(runtime),
                warm: { key: root, pool: warmPool },
                tools: [echoHostTool],
                workspaceDir,
            });

        const fresh = await timed('open fresh', () =>
            driver().openSession({ resumeFrom: undefined, sessionId: 'live' })
        );
        let steered: Promise<SteerResult> | undefined;
        const first = await run(
            fresh,
            'Remember the codeword MANGO. Run the shell command `sleep 4`, then reply with exactly ORIGINAL.',
            (event) => {
                if (event.type === 'tool-call' && event.toolName === 'bash') {
                    steered ??= fresh.steer(
                        'Change the final reply to exactly INTERJECTED and nothing else.'
                    );
                }
            }
        );
        expect(await steered).toEqual({ delivered: true });
        expect(first.text).toContain('INTERJECTED');

        const second = await run(
            fresh,
            'Find the haus echo tool with your tool search and call it with text "live". Reply with exactly what it returned.'
        );
        expect(second.events).toContainEqual(
            expect.objectContaining({ output: 'echo:live', toolName: 'echo', type: 'tool-result' })
        );

        const parked = await fresh.detach();
        const warm = await timed('open warm', () =>
            driver().openSession({ resumeFrom: parked, sessionId: 'live' })
        );
        expect(warm.isResume).toBe(true);
        expect((await run(warm, 'What was the codeword? Reply with the one word.')).text).toContain(
            'MANGO'
        );

        const stopped = await warm.stop();
        const cold = await timed('open cold resume', () =>
            driver().openSession({ resumeFrom: stopped, sessionId: 'live' })
        );
        expect(cold.sessionId).toBe(fresh.sessionId);
        expect((await run(cold, 'Repeat the codeword once more, one word.')).text).toContain(
            'MANGO'
        );
        await cold.stop();
    },
    240_000
);

async function run(session: RuntimeSession, prompt: string, onEvent?: (event: TurnEvent) => void) {
    const startedAt = performance.now();
    const turn = await session.startTurn({ prompt, signal: new AbortController().signal });
    const events: TurnEvent[] = [];
    let firstEventMs: number | undefined;
    let firstOutputMs: number | undefined;
    for await (const event of turn.events) {
        firstEventMs ??= performance.now() - startedAt;
        if (event.type !== 'progress') {
            firstOutputMs ??= performance.now() - startedAt;
        }
        events.push(event);
        onEvent?.(event);
    }
    report(
        `turn first event ${Math.round(firstEventMs ?? 0)}ms, first output ${Math.round(firstOutputMs ?? 0)}ms, total ${Math.round(performance.now() - startedAt)}ms`
    );
    expect(events.at(-1)).toMatchObject({ type: 'turn-finish' });
    const text = events.map((event) => (event.type === 'text-delta' ? event.text : '')).join('');
    return { events, text };
}

async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
    const startedAt = performance.now();
    const result = await work();
    report(`${label} ${Math.round(performance.now() - startedAt)}ms`);
    return result;
}

function report(line: string) {
    process.stdout.write(`[grok-live] ${line}\n`);
}
