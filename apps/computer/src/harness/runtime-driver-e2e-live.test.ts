import { afterAll, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import type { AgentInboxItem } from '../agent-inbox-item.ts';
import { AgentTurnTimings } from '../agent-turn-timings.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { closeRuntimeContext, openRuntimeContext } from '../runtime/runtime-context.ts';
import { type HarnessTurnInput, runHarnessTurn } from './executor.ts';
import { readAgentSessionState } from './session-store.ts';

// Opt-in: every runtime through the real executor, driver factory, runtime context, and
// installed CLI — two turns on one Agent session plus a busy notice steered into the first.
// HAUS_RUN_LIVE_RUNTIME_E2E_TEST=1 bun test apps/computer/src/harness/runtime-driver-e2e-live.test.ts
// HAUS_LIVE_RUNTIMES narrows the set (comma-separated runtime ids).
const enabled = process.env.HAUS_RUN_LIVE_RUNTIME_E2E_TEST === '1';
const selected = process.env.HAUS_LIVE_RUNTIMES?.split(',') ?? [
    'claude-code',
    'codex',
    'grok-build',
];
const models: Record<string, string> = {
    'claude-code': process.env.HAUS_LIVE_CLAUDE_MODEL ?? 'claude-haiku-4-5',
    codex: process.env.HAUS_LIVE_CODEX_MODEL ?? 'gpt-5.6-luna',
    'grok-build': process.env.HAUS_LIVE_GROK_MODEL ?? 'grok-4.6',
};
const runtime = makeDaemonRuntime();
const roots: string[] = [];
if (enabled) {
    openRuntimeContext(runtime);
}
afterAll(async () => {
    await closeRuntimeContext(runtime);
    await runtime.dispose();
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

const notice = 'Inbox notice: nothing new needs you. Finish your current task.';

for (const runtimeId of Object.keys(models)) {
    const liveTest =
        enabled && selected.includes(runtimeId) && installed(runtimeId) ? test : test.skip;
    liveTest(
        `${runtimeId}: two turns resume one session and a busy notice steers into the first`,
        async () => {
            const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-runtime-e2e-')));
            roots.push(root);
            await Promise.all(
                ['home', 'runtime', 'skills', 'workspace'].map((dir) =>
                    mkdir(join(root, dir), { recursive: true })
                )
            );
            const timings: Record<string, unknown> = {};

            const first = await timedTurn(root, runtimeId, 1, {
                content:
                    'This is a Haus wiring test. Do not use the haus CLI and send no messages. Run the shell command `sleep 3`, then run `echo done`, then end your turn with the single word ONE.',
                steer: true,
            });
            timings.first = first.timing;
            expect(first.result.aborted).toBe(false);
            expect(await first.steered).toBe(true);
            // The model received the steer, so nothing went back on the pending path.
            expect(existsSync(join(root, 'runtime', 'pending-notice.json'))).toBe(false);
            const parked = (await readAgentSessionState(root))?.resumeState;
            expect(parked).toMatchObject({ runtime: runtimeId, version: 1 });

            const second = await timedTurn(root, runtimeId, 2, {
                content: 'Reply with the single word TWO. Use no tools.',
                steer: false,
            });
            timings.second = second.timing;
            expect(second.result.aborted).toBe(false);
            // The second turn resumed the same native conversation.
            expect((await readAgentSessionState(root))?.resumeState).toEqual(parked);
            console.log(`[runtime-e2e] ${runtimeId} ${JSON.stringify(timings)}`);
        },
        600_000
    );
}

async function timedTurn(
    root: string,
    runtimeId: string,
    sequence: number,
    options: { content: string; steer: boolean }
) {
    const turnTimings = new AgentTurnTimings();
    const steered = Promise.withResolvers<boolean>();
    let deliver: ((text: string) => Promise<boolean>) | null = null;
    let requested = false;
    const steerOnce = () => {
        if (!(options.steer && deliver) || requested) {
            return;
        }
        requested = true;
        const send = deliver;
        // The executor delivers a stored notice only while it is still the stored one.
        void writeFile(join(root, 'runtime', 'pending-notice.json'), JSON.stringify({ notice }))
            .then(() => send(notice))
            .then(steered.resolve, steered.reject);
    };
    const item: AgentInboxItem = {
        addressed: true,
        chatId: 'cht_e2e',
        content: options.content,
        createdAt: new Date().toISOString(),
        id: `itm_${sequence}`,
        senderHandle: 'operator',
        senderType: 'human',
        sequence,
        target: 'dm:operator',
    };
    const input: HarnessTurnInput = {
        activity: new AgentActivityRun(runtime, (update) => {
            if (update.category === 'running_command' && update.phase === 'started') {
                steerOnce();
            }
        }),
        agentId: 'agt_e2e',
        agentName: 'Wiring',
        agentRoot: root,
        dataRoot: root,
        drainItemIds: [item.id],
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        factoryKind: 'ordinary',
        homeDir: join(root, 'home'),
        homeTimezone: 'UTC',
        inbox: [item],
        inboxDelivery: 'concrete',
        initialRole: null,
        modelId: models[runtimeId] ?? '',
        reasoningEffort: 'low',
        registerNoticeSink: (sink) => {
            deliver = sink;
            return () => {
                deliver = null;
            };
        },
        runId: `run_e2e_${sequence}`,
        runtime,
        runtimeId,
        serverId: 'srv_e2e',
        sessionGeneration: 1,
        skillsDir: join(root, 'skills'),
        tools: [],
        totalPending: 1,
        turnTimings,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        workspaceDir: join(root, 'workspace'),
    };
    if (!options.steer) {
        steered.resolve(false);
    }
    const startedAt = Date.now();
    const result = await runHarnessTurn(input);
    if (options.steer && !requested) {
        steered.resolve(false);
    }
    return {
        result,
        steered: steered.promise,
        timing: { totalMs: Date.now() - startedAt, ...turnTimings.snapshot() },
    };
}

/** Claude Code and Codex install their pinned CLI; Grok Build runs the operator's own. */
function installed(runtimeId: string): boolean {
    return (
        runtimeId !== 'grok-build' ||
        Bun.which('grok') !== null ||
        existsSync(join(process.env.HOME ?? '', '.grok', 'bin', 'grok'))
    );
}
