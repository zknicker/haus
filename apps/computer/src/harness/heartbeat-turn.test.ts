import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import type { RuntimeDriverOptions } from '../runtime/driver.ts';
import type { RuntimeResumeState } from '../runtime/resume-state.ts';
import { fakeRuntimeDriver } from '../runtime/testing/fake-runtime-driver.ts';
import type { TurnEvent } from '../runtime/turn-event.ts';
import {
    type HarnessTurnInput,
    runHarnessTurn,
    setRuntimeDriverFactoryForTesting,
} from './executor.ts';
import { readQuietRunNote, recordHeartbeatSettled } from './heartbeat-note.ts';
import { composeAgentInstructions } from './instructions.ts';
import { harnessSessionOwner } from './session-lifecycle.ts';
import { writeAgentSessionState } from './session-store.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

const heartbeat = {
    connections: [],
    createdAt: '2026-10-20T10:05:00.000Z',
    digest: { entries: [], more: 0 },
    id: 'heartbeat:agt_test:2026-10-20:10:00',
    kind: 'daytime' as const,
    leads: [],
    reminders: [],
    since: null,
};
const mainResume: RuntimeResumeState = {
    runtime: 'codex',
    threadId: 'main_native',
    version: 1,
};

let agentRoot: string;
let opens: Array<{ resumeFrom: unknown; sessionId: string }>;
let launches: RuntimeDriverOptions[];
let destroyed: string[];
let detached: number;
let prompts: string[];
let streamFails: boolean;
let restore: () => void;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-heartbeat-turn-'));
    opens = [];
    launches = [];
    destroyed = [];
    detached = 0;
    prompts = [];
    streamFails = false;
    const { factory } = fakeRuntimeDriver<HarnessTurnInput>({
        destroy: () => {
            destroyed.push(opens.at(-1)?.sessionId ?? '');
        },
        detach: () => {
            detached += 1;
            return mainResume;
        },
        open: async ({ resumeFrom, sessionId }, { options }) => {
            opens.push({ resumeFrom, sessionId });
            launches.push(options);
            // A run directory the executor must clean up after a throwaway session.
            await mkdir(join(agentRoot, '.agent-runs', sessionId), { recursive: true });
        },
        turn: ({ prompt }) => scriptedTurn(prompt),
    });
    restore = setRuntimeDriverFactoryForTesting(factory);
    await writeAgentSessionState(agentRoot, {
        bootstrapFingerprint: 'fake-bootstrap',
        // The main session already runs on the current instructions.
        deliveredInstructionFingerprint: composeAgentInstructions({
            ...turnInput(),
            workspacePath: join(agentRoot, 'workspace'),
        }).stableFingerprint,
        effectiveModel: { modelId: 'gpt-5.6-sol', runtimeId: 'codex' },
        generation: 1,
        hausAgentAppliedAt: null,
        hausAgentStatus: 'current',
        hausAgentVersion: null,
        instructionFingerprint: null,
        launchedInstructionFingerprint: null,
        resumeState: mainResume,
        runtimeSessionId: 'main_session',
    });
});

afterEach(async () => {
    restore();
    await rm(agentRoot, { force: true, recursive: true });
});

function* scriptedTurn(prompt: string): Generator<TurnEvent> {
    prompts.push(prompt);
    yield { contextTokens: 1, type: 'step-finish', usage: null };
    if (streamFails) {
        yield { error: new Error('provider failed'), type: 'error' };
    } else {
        yield { claudePlanUsage: null, type: 'turn-finish', usage: null };
    }
}

function turnInput(overrides: Partial<HarnessTurnInput> = {}): HarnessTurnInput {
    return {
        activity: new AgentActivityRun(runtime, () => undefined),
        agentId: 'agt_test',
        agentName: 'Cove',
        agentRoot,
        dataRoot: agentRoot,
        drainItemIds: [],
        env: {},
        factoryKind: 'ordinary',
        homeDir: join(agentRoot, 'home'),
        homeTimezone: 'UTC',
        inbox: [],
        inboxDelivery: 'concrete',
        initialRole: null,
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runId: 'run_hb',
        runtime,
        runtimeId: 'codex',
        serverId: 'srv_test',
        sessionGeneration: 1,
        skillsDir: join(agentRoot, 'skills'),
        tools: [],
        totalPending: 0,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        workspaceDir: join(agentRoot, 'workspace'),
        ...overrides,
    };
}

async function sessionFile(): Promise<string> {
    return await readFile(join(agentRoot, 'session.json'), 'utf8');
}

test('a heartbeat opens a fresh session under its own warm key, leaves the main session alone, and destroys it', async () => {
    const before = await sessionFile();
    const owner = harnessSessionOwner(runtime);
    const mainLease = owner.begin(agentRoot);

    const result = await runHarnessTurn(turnInput({ heartbeat }));

    expect(result.aborted).toBe(false);
    expect(opens).toEqual([{ resumeFrom: undefined, sessionId: 'agt_test-hb-run_hb' }]);
    expect(launches[0]?.throwawayKey).toBe(`${agentRoot}#agt_test-hb-run_hb`);
    expect(destroyed).toEqual(['agt_test-hb-run_hb']);
    expect(detached).toBe(0);
    expect(prompts[0]).toContain('[Haus daytime heartbeat]');
    expect(await sessionFile()).toBe(before);
    expect(
        await access(join(agentRoot, '.agent-runs', 'agt_test-hb-run_hb')).catch(() => 'gone')
    ).toBe('gone');
    // The main lease is still the Agent's registered lease and was never finished or replaced.
    expect((owner as unknown as { sessions: Map<string, unknown> }).sessions.get(agentRoot)).toBe(
        mainLease
    );
    mainLease.finish();
});

test('a failed heartbeat still destroys its session and never marks the main session interrupted', async () => {
    const before = await sessionFile();
    streamFails = true;
    await expect(runHarnessTurn(turnInput({ heartbeat }))).rejects.toThrow();

    expect(destroyed).toEqual(['agt_test-hb-run_hb']);
    expect(await sessionFile()).toBe(before);
    expect(
        await access(join(agentRoot, '.agent-runs', 'agt_test-hb-run_hb')).catch(() => 'gone')
    ).toBe('gone');
});

test('a heartbeat neither reads nor clears the quiet-run note', async () => {
    await recordHeartbeatSettled(agentRoot, { reported: false });
    await runHarnessTurn(turnInput({ heartbeat }));
    expect(await readQuietRunNote(agentRoot)).toMatchObject({ count: 1 });
});

test('the next main-session turn starts with the quiet-run line, resumes the main session, and clears it', async () => {
    await recordHeartbeatSettled(agentRoot, { reported: false });
    await recordHeartbeatSettled(agentRoot, { reported: true });

    await runHarnessTurn(
        turnInput({
            drainItemIds: ['msg_1'],
            inbox: [
                {
                    chatId: 'cht_1',
                    content: 'what have you been up to?',
                    createdAt: '2026-10-20T11:00:00.000Z',
                    id: 'msg_1',
                    senderHandle: 'maya',
                    senderType: 'human',
                    sequence: 1,
                    target: 'dm:@maya',
                },
            ],
            runId: 'run_main',
            totalPending: 1,
        })
    );

    expect(prompts[0]?.split('\n')[0]).toBe(
        'Your heartbeat ran 2× since your last turn (1 reported).'
    );
    expect(opens[0]?.resumeFrom).toEqual(mainResume);
    expect(launches[0]?.throwawayKey).toBeUndefined();
    expect(await readQuietRunNote(agentRoot)).toBeNull();
});

test('a failed main-session turn keeps the quiet-run note for the retry', async () => {
    await recordHeartbeatSettled(agentRoot, { reported: false });
    streamFails = true;
    await expect(runHarnessTurn(turnInput({ runId: 'run_main_fail' }))).rejects.toThrow();
    expect(await readQuietRunNote(agentRoot)).toMatchObject({ count: 1 });
});

test('a report run resumes the main session and clears the note without rendering it', async () => {
    await recordHeartbeatSettled(agentRoot, { reported: true });
    await runHarnessTurn(
        turnInput({
            heartbeatReport: {
                createdAt: '2026-10-20T10:40:00.000Z',
                heartbeatKind: 'daytime',
                heartbeatRunId: 'run_hb',
                id: 'heartbeat-report:run_hb',
                text: 'Three new 2-star reviews.',
            },
            runId: 'run_report',
        })
    );
    expect(prompts[0]).toContain('[Haus heartbeat report]');
    expect(prompts[0]).not.toContain('Your heartbeat ran');
    expect(opens[0]).toMatchObject({ resumeFrom: mainResume, sessionId: 'main_session' });
    expect(await readQuietRunNote(agentRoot)).toBeNull();
});
