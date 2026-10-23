import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import {
    type HarnessTurnInput,
    runHarnessTurn,
    setHarnessAgentFactoryForTesting,
    setHarnessBootstrapRefreshForTesting,
} from './executor.ts';
import { readQuietRunNote, recordHeartbeatSettled } from './heartbeat-note.ts';
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
const mainResume = {
    data: { nativeSessionId: 'main_native' },
    harnessId: 'fake',
    type: 'resume-session',
};

let agentRoot: string;
let createSessionCalls: Array<{ resumeFrom: unknown; sessionId: string }>;
let destroyed: string[];
let detached: string[];
let prompts: string[];
let streamFails: boolean;
let restore: Array<() => void>;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-heartbeat-turn-'));
    createSessionCalls = [];
    destroyed = [];
    detached = [];
    prompts = [];
    streamFails = false;
    restore = [
        setHarnessAgentFactoryForTesting(() => fakeAgent()),
        setHarnessBootstrapRefreshForTesting(async () => undefined),
    ];
    await writeAgentSessionState(agentRoot, {
        bootstrapFingerprint: null,
        effectiveModel: { modelId: 'gpt-5.6-sol', runtimeId: 'codex' },
        generation: 1,
        hausAgentAppliedAt: null,
        hausAgentStatus: 'current',
        hausAgentVersion: null,
        instructionFingerprint: null,
        resumeState: mainResume,
        runtimeSessionId: 'main_session',
    });
});

afterEach(async () => {
    for (const undo of restore) {
        undo();
    }
    await rm(agentRoot, { force: true, recursive: true });
});

function fakeAgent(): Pick<HarnessAgent, 'createSession' | 'stream'> {
    return {
        createSession: (async (options: { resumeFrom?: unknown; sessionId: string }) => {
            createSessionCalls.push({
                resumeFrom: options.resumeFrom,
                sessionId: options.sessionId,
            });
            // A native run directory the executor must clean up after a throwaway session.
            await mkdir(join(agentRoot, '.agent-runs', options.sessionId), { recursive: true });
            return {
                destroy: async () => {
                    destroyed.push(options.sessionId);
                },
                detach: async () => {
                    detached.push(options.sessionId);
                    return mainResume;
                },
                isResume: Boolean(options.resumeFrom),
                sessionId: options.sessionId,
                stop: async () => mainResume,
            };
        }) as unknown as HarnessAgent['createSession'],
        stream: (async (options: { prompt: string }) => {
            prompts.push(options.prompt);
            return {
                consumeStream: async () => undefined,
                fullStream: (async function* () {
                    yield { type: 'finish-step', usage: usage() };
                    if (streamFails) {
                        yield { error: new Error('provider failed'), type: 'error' };
                    } else {
                        yield { totalUsage: usage(), type: 'finish' };
                    }
                })(),
            };
        }) as unknown as HarnessAgent['stream'],
    };
}

function usage() {
    return {
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0, noCacheTokens: 1 },
        inputTokens: 1,
        outputTokenDetails: { reasoningTokens: undefined, textTokens: 1 },
        outputTokens: 1,
        raw: undefined,
        totalTokens: 2,
    };
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
        tools: {},
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

test('a heartbeat opens a fresh session, leaves session.json and the main lease alone, and destroys it', async () => {
    const before = await sessionFile();
    const owner = harnessSessionOwner(runtime);
    const mainLease = owner.begin(agentRoot);
    mainLease.prepare(mainResume as never, async () => {
        throw new Error('the main session must not be resumed');
    });

    const result = await runHarnessTurn(turnInput({ heartbeat }));

    expect(result.aborted).toBe(false);
    expect(createSessionCalls).toEqual([
        { resumeFrom: undefined, sessionId: 'agt_test-hb-run_hb' },
    ]);
    expect(destroyed).toEqual(['agt_test-hb-run_hb']);
    expect(detached).toEqual([]);
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
    await recordHeartbeatSettled(agentRoot, {
        reported: false,
    });
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
    expect(createSessionCalls[0]?.resumeFrom).toMatchObject({ type: 'resume-session' });
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
    expect(createSessionCalls[0]).toMatchObject({ sessionId: 'main_session' });
    expect(await readQuietRunNote(agentRoot)).toBeNull();
});
