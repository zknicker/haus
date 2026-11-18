import { afterAll, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import type { AgentInboxItem } from '../agent-inbox-item.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { closeRuntimeContext, openRuntimeContext } from '../runtime/runtime-context.ts';
import { type HarnessTurnInput, runHarnessTurn } from './executor.ts';
import { readAgentSessionState } from './session-store.ts';

// Opt-in canary: a resumed session follows changed instructions on every runtime. Turn one starts a
// session whose instructions carry CANARY-ALPHA; turn two resumes it with CANARY-BRAVO and asks
// which codeword the instructions give. Each runtime keeps a resumed session's launch
// instructions, so only the `<haus-instructions-update>` block can make it answer BRAVO.
// HAUS_RUN_LIVE_INSTRUCTIONS_UPDATE_TEST=1 bun test apps/computer/src/harness/instructions-update-live.test.ts
// HAUS_LIVE_RUNTIMES narrows the set (comma-separated runtime ids).
const enabled = process.env.HAUS_RUN_LIVE_INSTRUCTIONS_UPDATE_TEST === '1';
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

const wiring = 'This is a Haus wiring test. Do not use the haus CLI and send no messages.';

for (const runtimeId of Object.keys(models)) {
    const liveTest =
        enabled && selected.includes(runtimeId) && installed(runtimeId) ? test : test.skip;
    liveTest(
        `${runtimeId}: a resumed session follows its changed instructions`,
        async () => {
            const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-instructions-live-')));
            roots.push(root);
            await Promise.all(
                ['home', 'runtime', 'skills', 'workspace'].map((dir) =>
                    mkdir(join(root, dir), { recursive: true })
                )
            );

            const first = await runHarnessTurn(
                turnInput(root, runtimeId, 1, 'CANARY-ALPHA', `${wiring} Use no tools. Reply ONE.`)
            );
            expect(first.aborted).toBe(false);
            const started = await readAgentSessionState(root);

            const second = await runHarnessTurn(
                turnInput(
                    root,
                    runtimeId,
                    2,
                    'CANARY-BRAVO',
                    `${wiring} Run one shell command that writes your canary codeword, exactly as your standing instructions give it right now and nothing else, to canary.txt in your working directory. Then end your turn.`
                )
            );
            expect(second.aborted).toBe(false);
            const answer = (await readFile(join(root, 'workspace', 'canary.txt'), 'utf8')).trim();
            console.log(`[instructions-update-live] ${runtimeId} answered ${answer}`);
            const resumed = await readAgentSessionState(root);
            // The same native conversation resumed: a fresh session would trivially say BRAVO.
            expect(resumed?.resumeState).toEqual(started?.resumeState ?? null);
            expect(answer).toBe('CANARY-BRAVO');
            expect(resumed?.deliveredInstructionFingerprint).not.toBe(
                started?.deliveredInstructionFingerprint
            );
        },
        600_000
    );
}

function turnInput(
    root: string,
    runtimeId: string,
    sequence: number,
    codeword: string,
    content: string
): HarnessTurnInput {
    const item: AgentInboxItem = {
        addressed: true,
        chatId: 'cht_canary',
        content,
        createdAt: new Date().toISOString(),
        id: `itm_${sequence}`,
        senderHandle: 'operator',
        senderType: 'human',
        sequence,
        target: 'dm:operator',
    };
    return {
        activity: new AgentActivityRun(runtime, () => undefined),
        agentId: 'agt_canary',
        agentName: 'Canary',
        agentRoot: root,
        dataRoot: root,
        drainItemIds: [item.id],
        env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
        factoryKind: 'ordinary',
        homeDir: join(root, 'home'),
        homeTimezone: 'UTC',
        inbox: [item],
        inboxDelivery: 'concrete',
        initialRole: `Wiring test agent. Your canary codeword is ${codeword}.`,
        modelId: models[runtimeId] ?? '',
        reasoningEffort: 'low',
        runId: `run_canary_${sequence}`,
        runtime,
        runtimeId,
        serverId: 'srv_canary',
        sessionGeneration: 1,
        skillsDir: join(root, 'skills'),
        tools: [],
        totalPending: 1,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        workspaceDir: join(root, 'workspace'),
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
