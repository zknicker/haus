import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import { seedCoveWorkspace } from '@haus/agent-workspace';
import { hausAgentVersion } from '@haus/api';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { composeInboxDrain, composeInboxNotice } from '../inbox-format.ts';
import { acceptRunInbox, replacePendingInbox } from '../inbox-store.ts';
import { readClaudePlanUsageState } from '../usage/claude-plan-usage-state.ts';
import { readComputerExecutionJournal } from './execution-journal.ts';
import {
    AgentSessionResumeRejectedError,
    HarnessTurnFailedError,
    type HarnessTurnInput,
    runHarnessTurn,
    setHarnessAgentFactoryForTesting,
    setHarnessBootstrapRefreshForTesting,
} from './executor.ts';
import { legacyCoveFaq, legacyCovePlaybook } from './executor-fixtures.ts';
import type { AgentSessionState } from './session-store.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
interface CreateSessionCall {
    resumeFrom: unknown;
    sessionId: string;
}

let agentRoot: string;
let acceptsUserMessages: boolean;
let agentInstructions: string[];
let createSessionCalls: CreateSessionCall[];
let detachedSessions: number;
let restore: () => void;
let restoreBootstrapRefresh: () => void;
let rejectResume: boolean;
let refreshedBootstraps: number;
let sentUserMessages: string[];
let stoppedSessions: number;
let streamIncludesToolBoundary: boolean;
let streamAborts: boolean;
let streamProviderMetadata: Record<string, unknown> | undefined;
let streamFails: boolean;
let streamUsageScale: number;
let streamedPrompts: string[];
let streamToolNames: string[];
let streamedCoveFaqs: Array<string | null>;
let streamedCovePlaybooks: Array<string | null>;

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-harness-'));
    acceptsUserMessages = true;
    agentInstructions = [];
    createSessionCalls = [];
    detachedSessions = 0;
    rejectResume = false;
    refreshedBootstraps = 0;
    sentUserMessages = [];
    stoppedSessions = 0;
    streamAborts = false;
    streamIncludesToolBoundary = false;
    streamProviderMetadata = undefined;
    streamFails = false;
    streamUsageScale = 1;
    streamedPrompts = [];
    streamToolNames = [];
    streamedCoveFaqs = [];
    streamedCovePlaybooks = [];
    restore = setHarnessAgentFactoryForTesting((input, options) => {
        agentInstructions.push(options.instructions);
        return fakeAgent(input);
    });
    restoreBootstrapRefresh = setHarnessBootstrapRefreshForTesting(async () => {
        refreshedBootstraps += 1;
    });
});

afterEach(async () => {
    restore();
    restoreBootstrapRefresh();
    await rm(agentRoot, { force: true, recursive: true });
});

function fakeAgent(input: HarnessTurnInput): Pick<HarnessAgent, 'createSession' | 'stream'> {
    return {
        createSession: (async (options: { resumeFrom?: unknown; sessionId: string }) => {
            createSessionCalls.push({
                resumeFrom: options.resumeFrom,
                sessionId: options.sessionId,
            });
            if (options.resumeFrom && rejectResume) {
                throw new Error('runtime session gone');
            }
            return {
                detach: async () => {
                    detachedSessions += 1;
                    return {
                        data: { detachSequence: detachedSessions },
                        harnessId: 'fake',
                        type: 'resume-session',
                    };
                },
                destroy: async () => undefined,
                isResume: Boolean(options.resumeFrom),
                experimental_steerTurn: async (message: string) => {
                    sentUserMessages.push(message);
                    if (!acceptsUserMessages) {
                        throw new HarnessCapabilityUnsupportedError({
                            harnessId: 'codex',
                            message: 'Harness does not support steering active turns.',
                        });
                    }
                },
                hasUnfinishedTurn: () => true,
                sessionId: 'engine_session_1',
                stop: async () => {
                    stoppedSessions += 1;
                    return {
                        data: { nativeSessionId: 'native_session_1' },
                        harnessId: 'fake',
                        type: 'resume-session',
                    };
                },
            };
        }) as unknown as HarnessAgent['createSession'],
        stream: (async (options: { prompt: string }) => {
            streamedPrompts.push(options.prompt);
            if (input.factoryKind === 'cove') {
                streamedCoveFaqs.push(
                    await readOptionalText(
                        join(input.workspaceDir, 'notes', 'onboarding_knowledge_faq.md')
                    )
                );
                streamedCovePlaybooks.push(
                    await readOptionalText(
                        join(input.workspaceDir, 'notes', 'onboarding_playbook.md')
                    )
                );
            }
            return {
                fullStream: (async function* () {
                    for (const [index, toolName] of streamToolNames.entries()) {
                        yield { toolCallId: `call_${index}`, toolName, type: 'tool-call' };
                    }
                    if (streamIncludesToolBoundary) {
                        if (streamToolNames.length === 0) {
                            yield { type: 'tool-result' };
                        } else {
                            for (const [index, toolName] of streamToolNames.entries()) {
                                yield {
                                    output: { ok: true },
                                    toolCallId: `call_${index}`,
                                    toolName,
                                    type: 'tool-result',
                                };
                            }
                        }
                    }
                    yield {
                        type: 'finish-step',
                        usage: streamFails ? publicUsage(streamUsageScale) : publicUsage(0),
                    };
                    if (streamAborts) {
                        yield { type: 'abort' };
                    } else if (streamFails) {
                        yield { error: new Error('provider failed'), type: 'error' };
                    } else {
                        yield {
                            providerMetadata: streamProviderMetadata,
                            totalUsage: publicUsage(streamUsageScale),
                            type: 'finish',
                        };
                    }
                })(),
            };
        }) as unknown as HarnessAgent['stream'],
    };
}

async function readOptionalText(path: string): Promise<string | null> {
    return await readFile(path, 'utf8').catch((error: unknown) => {
        if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'ENOENT'
        ) {
            return null;
        }
        throw error;
    });
}

function publicUsage(scale = 1) {
    return {
        inputTokenDetails: {
            cacheReadTokens: 8 * scale,
            cacheWriteTokens: 2 * scale,
            noCacheTokens: 2 * scale,
        },
        inputTokens: 10 * scale,
        outputTokenDetails: { reasoningTokens: undefined, textTokens: 5 * scale },
        outputTokens: 5 * scale,
        raw: undefined,
        totalTokens: 15 * scale,
    };
}

type TestTurnOverrides = Partial<HarnessTurnInput> & {
    onActivity?: (activity: { category: string; phase: string }) => void;
};

function turnInput(overrides: TestTurnOverrides = {}): HarnessTurnInput {
    const { activity, onActivity, ...inputOverrides } = overrides;
    const input: HarnessTurnInput = {
        activity:
            activity ??
            new AgentActivityRun(runtime, ({ category, phase }) =>
                onActivity?.({ category, phase })
            ),
        agentId: 'agt_test',
        agentName: 'Cove',
        agentRoot,
        dataRoot: agentRoot,
        env: {},
        factoryKind: 'ordinary',
        homeDir: join(agentRoot, 'home'),
        homeTimezone: 'UTC',
        initialRole: null,
        inbox: [
            {
                chatId: 'cht_test',
                content: 'Hello Cove',
                createdAt: '2026-07-27T00:00:00.000Z',
                id: 'msg_test',
                senderHandle: 'operator',
                senderType: 'human',
                sequence: 1,
                target: 'dm:@operator',
            },
        ],
        inboxDelivery: 'concrete',
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runId: 'run_test',
        runtimeId: 'codex',
        runtime,
        sessionGeneration: 1,
        skillsDir: join(agentRoot, 'skills'),
        totalPending: 1,
        webAccess: null,
        workspaceDir: join(agentRoot, 'workspace'),
        drainItemIds: [],
        serverId: 'srv_executor_test',
        unreadElsewhere: [],
        warmDrainItemIds: [],
        ...inputOverrides,
        tools: overrides.tools ?? {},
    };
    // A concrete frame drains everything it carries; the Server sets the same
    // ids on the wire, so the default keeps these turns behaving as they did.
    return inputOverrides.drainItemIds || input.inboxDelivery !== 'concrete'
        ? input
        : { ...input, drainItemIds: input.inbox.map((item) => item.id) };
}

async function readSession(): Promise<AgentSessionState> {
    return JSON.parse(await readFile(join(agentRoot, 'session.json'), 'utf8')) as AgentSessionState;
}
test('effort changes restart the native process and resume the same conversation', async () => {
    await runHarnessTurn(turnInput());
    const original = await readSession();
    await runHarnessTurn({ ...turnInput(), reasoningEffort: 'high' });
    const updated = await readSession();
    expect(stoppedSessions).toBe(1);
    expect(refreshedBootstraps).toBe(0);
    expect(updated.generation).toBe(original.generation);
    expect(updated.runtimeSessionId).toBe(original.runtimeSessionId);
    expect(updated.effectiveReasoningEffort).toBe('high');
    expect(createSessionCalls.at(-1)?.resumeFrom).toMatchObject({
        data: { nativeSessionId: 'native_session_1' },
    });
    await runHarnessTurn({ ...turnInput(), reasoningEffort: 'high' });
    expect(stoppedSessions).toBe(1);
});

test('cold-starts a fresh Agent then resumes its one global session', async () => {
    const first = await runHarnessTurn(turnInput());
    expect(first.contextTokens).toBe(15);
    expect(first.tokenUsage).toEqual({
        cacheReadTokens: 8,
        cacheWriteTokens: 2,
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
    });
    expect(first.aborted).toBe(false);
    expect(createSessionCalls[0]?.resumeFrom).toBeUndefined();
    const afterFirst = await readSession();
    expect(afterFirst.generation).toBe(1);
    expect(afterFirst.runtimeSessionId).toBe('engine_session_1');
    expect(afterFirst.resumeState).toMatchObject({ type: 'resume-session' });
    expect(streamedPrompts[0]).toContain(
        '[target=dm:@operator msg=test time=2026-07-27 00:00:00 type=human] @operator: Hello Cove'
    );
    expect(streamedPrompts).toHaveLength(1);
    expect(sentUserMessages).toEqual([]);

    streamUsageScale = 2;
    const second = await runHarnessTurn(turnInput());
    // Second turn resumes: the stored resume state is handed back to the engine.
    expect(createSessionCalls[1]?.resumeFrom).toMatchObject({ type: 'resume-session' });
    expect((await readSession()).generation).toBe(1);
    expect(second.tokenUsage).toEqual(first.tokenUsage);
});
test('persists Claude plan limits emitted by the managed SDK turn', async () => {
    streamProviderMetadata = {
        'claude-code': {
            planUsage: {
                rate_limits: {
                    five_hour: {
                        resets_at: '2026-08-14T20:00:00.000Z',
                        utilization: 12,
                    },
                    seven_day: {
                        resets_at: '2026-08-20T20:00:00.000Z',
                        utilization: 34,
                    },
                },
                rate_limits_available: true,
                subscription_type: 'max',
            },
        },
    };

    const result = await runHarnessTurn(turnInput({ runtimeId: 'claude-code' }));

    expect(result.claudePlanUsage).toMatchObject({
        source: 'claude-code-sdk-usage',
        subscriptionType: 'max',
        windows: [
            { id: 'current-session', usedPercent: 12 },
            { id: 'current-week-all-models', usedPercent: 34 },
        ],
    });
    expect((await readClaudePlanUsageState(agentRoot)).snapshot).toEqual(result.claudePlanUsage);
});
test('seeds a Codex cumulative baseline when upgrading an existing session', async () => {
    await runHarnessTurn(turnInput());
    const { cumulativeTokenUsage: _removed, ...legacySession } = await readSession();
    await writeFile(join(agentRoot, 'session.json'), `${JSON.stringify(legacySession)}\n`);
    streamUsageScale = 2;

    const migrated = await runHarnessTurn(turnInput());

    expect(migrated.tokenUsage).toBeNull();
    expect((await readSession()).cumulativeTokenUsage).toEqual({
        cacheReadTokens: 16,
        cacheWriteTokens: 4,
        inputTokens: 20,
        outputTokens: 10,
        totalTokens: 30,
    });
});
test('refreshes a pre-fingerprint session once without rotating it', async () => {
    await runHarnessTurn(turnInput());
    const {
        bootstrapFingerprint: _bootstrapFingerprint,
        instructionFingerprint: _instructionFingerprint,
        ...legacySession
    } = await readSession();
    await writeFile(join(agentRoot, 'session.json'), `${JSON.stringify(legacySession)}\n`);

    await runHarnessTurn(turnInput());

    const refreshed = await readSession();
    expect(refreshedBootstraps).toBe(1);
    expect(refreshed.generation).toBe(1);
    expect(refreshed.bootstrapFingerprint).not.toBeNull();
    expect(refreshed.instructionFingerprint).not.toBeNull();
});
test('keeps detailed tool evidence local instead of returning raw tool names', async () => {
    streamToolNames = [
        'mcp__catalog__get_issue',
        'mcp__catalog__get_issue',
        'shell_command',
        'read_file',
        'write_file',
        'search',
        'edit_file',
        'ignored_after_limit',
    ];

    const result = await runHarnessTurn(turnInput());

    expect(result).not.toHaveProperty('toolNames');
    const journal = await readComputerExecutionJournal(agentRoot, 'run_test');
    expect(journal?.tools.map((tool) => tool.toolName)).toEqual(streamToolNames);
});
test('keeps billable token usage when a provider fails after reporting usage', async () => {
    streamFails = true;
    await expect(runHarnessTurn(turnInput())).rejects.toMatchObject({
        name: HarnessTurnFailedError.name,
        tokenUsage: {
            cacheReadTokens: 8,
            cacheWriteTokens: 2,
            inputTokens: 10,
            outputTokens: 5,
            totalTokens: 15,
        },
    });
    const journal = await readComputerExecutionJournal(agentRoot, 'run_test');
    expect(journal?.error).toContain('provider failed');
});
test('projects tool stream boundaries into safe semantic activity', async () => {
    streamToolNames = ['cat_private_file'];
    streamIncludesToolBoundary = true;
    const activity: Array<{ category: string; phase: string }> = [];

    await runHarnessTurn(turnInput({ onActivity: (event) => activity.push(event) }));

    expect(activity).toEqual([
        { category: 'thinking', phase: 'started' },
        { category: 'using_tool', phase: 'started' },
        { category: 'using_tool', phase: 'completed' },
        { category: 'thinking', phase: 'completed' },
    ]);
});
test('uses a concrete cold inbox as the first prompt without mid-turn injection', async () => {
    acceptsUserMessages = false;

    await runHarnessTurn(turnInput());

    expect(streamedPrompts[0]).toContain('Hello Cove');
    expect(sentUserMessages).toEqual([]);
});
test('projects a concrete typed attention into the first prompt by its own identity', async () => {
    await runHarnessTurn(
        turnInput({
            inbox: [
                {
                    chatId: 'cht_origin',
                    cloudAgentWork: {
                        branches: [],
                        errorCode: null,
                        provider: 'cursor',
                        providerUrl: null,
                        repository: 'haus/haus',
                        runId: 'car_1234567890abcdef',
                        status: 'completed',
                        summary: 'Opened a pull request.',
                        title: 'Fix the flaky delivery test',
                        workId: 'caw_1234567890abcdef',
                    },
                    content: '',
                    createdAt: '2026-07-27T00:00:00.000Z',
                    id: 'car_1234567890abcdef',
                    senderHandle: 'haus',
                    senderType: 'system',
                    sequence: 0,
                    target: '#general',
                },
            ],
            inboxDelivery: 'concrete',
        })
    );

    expect(streamedPrompts[0]).toContain('work=caw_1234567890abcdef');
    expect(streamedPrompts[0]).toContain('run=car_1234567890abcdef');
    expect(streamedPrompts[0]).toContain('Opened a pull request.');
});

test('projects a concrete fire and a task assignment into the first prompt', async () => {
    const fire = {
        chatId: 'cht_origin',
        content: [
            '🔔 Reminder: Check the deploy',
            'fire=rmf_9a8b7c6d',
            'reply with: haus message send --cause rmf_9a8b7c6d',
        ].join('\n'),
        createdAt: '2026-07-27T00:00:00.000Z',
        id: 'rmf_9a8b7c6d',
        senderHandle: 'reminder',
        senderType: 'system' as const,
        sequence: 1,
        target: '#general',
    };
    await runHarnessTurn(turnInput({ inbox: [fire], inboxDelivery: 'concrete' }));

    // The wake itself carries the envelope, and it is the same envelope the
    // drain composes for a pulled item. A fire has no Chat message, so `msg=`
    // is `-` and the fire id rides the `fire=`/`--cause` lines instead.
    expect(streamedPrompts[0]).toContain(composeInboxDrain([fire], 'UTC'));
    expect(streamedPrompts[0]).toContain(
        '[target=#general msg=- time=2026-07-27 00:00:00 type=system] @reminder: 🔔 Reminder: Check the deploy'
    );
    expect(streamedPrompts[0]).toContain('reply with: haus message send --cause rmf_9a8b7c6d');

    streamedPrompts = [];
    const assignment = {
        chatId: 'cht_origin',
        content:
            '[Haus task assignment task=#1 target=#general assignedBy=@zach] Scout the release notes',
        createdAt: '2026-07-27T00:00:00.000Z',
        id: 'task-assign:msg_1a2b3c4d5e6f:3',
        mentioned: true,
        senderHandle: 'haus',
        senderType: 'system' as const,
        sequence: 1,
        target: '#general',
    };
    await runHarnessTurn(turnInput({ inbox: [assignment], inboxDelivery: 'concrete' }));

    expect(streamedPrompts[0]).toContain(
        '[target=#general msg=1a2b3c4d time=2026-07-27 00:00:00 type=system mentioned=true] @haus: [Haus task assignment task=#1 target=#general assignedBy=@zach] Scout the release notes'
    );
});

test('cold-starts ordinary Chat work with a content-free notice in the same task', async () => {
    const input = turnInput({ inboxDelivery: 'notice' });
    const runtimeDir = join(agentRoot, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(
        join(runtimeDir, 'pending-notice.json'),
        JSON.stringify({ notice: composeInboxNotice(input.inbox, input.totalPending) })
    );
    await runHarnessTurn(input);

    expect(streamedPrompts).toHaveLength(1);
    expect(streamedPrompts[0]).toContain('Haus inbox notice');
    expect(streamedPrompts[0]).toContain('dm:@operator  pending: 1 message');
    expect(streamedPrompts[0]).not.toContain('Hello Cove');
    expect(sentUserMessages).toEqual([]);
});

test('a warm notice prompt is not injected a second time from durable storage', async () => {
    await runHarnessTurn(turnInput());
    sentUserMessages = [];
    streamedPrompts = [];
    const input = turnInput({ inboxDelivery: 'notice' });
    const notice = composeInboxNotice(input.inbox, input.totalPending);
    if (!notice) {
        throw new Error('Expected a notice.');
    }
    const runtimeDir = join(agentRoot, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(join(runtimeDir, 'pending-notice.json'), JSON.stringify({ notice }));

    await runHarnessTurn(input);

    expect(streamedPrompts).toEqual([notice]);
    expect(sentUserMessages).toEqual([]);
    await expect(access(join(runtimeDir, 'pending-notice.json'))).rejects.toThrow();
});
test('an empty warm replay resumes without fabricating an inbox notice', async () => {
    await runHarnessTurn(turnInput());
    streamedPrompts = [];

    await runHarnessTurn(turnInput({ inbox: [], inboxDelivery: 'notice', totalPending: 0 }));

    expect(streamedPrompts).toEqual(['Resume the interrupted turn.']);
});
test('a cold start removes only its stale unresumable harness run', async () => {
    const staleRun = join(agentRoot, '.agent-runs', 'agt_test-1');
    await mkdir(staleRun, { recursive: true });
    await writeFile(join(staleRun, 'stale'), 'old bridge');

    await runHarnessTurn(turnInput());

    await expect(access(join(staleRun, 'stale'))).rejects.toThrow();
});

test('a Server generation change cold-starts the assigned runtime and model', async () => {
    await runHarnessTurn(turnInput());
    await runHarnessTurn(
        turnInput({
            modelId: 'claude-opus-4-8',
            runtimeId: 'claude-code',
            sessionGeneration: 2,
        })
    );

    expect(createSessionCalls[1]?.resumeFrom).toBeUndefined();
    const session = await readSession();
    expect(session.generation).toBe(2);
    expect(session.effectiveModel).toEqual({
        modelId: 'claude-opus-4-8',
        runtimeId: 'claude-code',
    });
    expect(streamedPrompts[1]).toContain(
        'Fresh session: your previous conversation context is gone.'
    );
    expect(streamedPrompts[1]).toContain('Hello Cove');
});

test('Restart resumes the same session and refreshes its current instructions once', async () => {
    await runHarnessTurn(turnInput());
    const runtimeDir = join(agentRoot, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(join(runtimeDir, 'restart-requested'), '');

    await runHarnessTurn(turnInput());

    expect(createSessionCalls[1]).toMatchObject({
        sessionId: 'engine_session_1',
    });
    expect(createSessionCalls[2]).toMatchObject({
        sessionId: 'engine_session_1',
    });
    expect(createSessionCalls[2]?.resumeFrom).toMatchObject({
        data: { nativeSessionId: 'native_session_1' },
        type: 'resume-session',
    });
    expect(stoppedSessions).toBe(1);
    expect(refreshedBootstraps).toBe(1);
    expect((await readSession()).generation).toBe(1);
    await expect(access(join(runtimeDir, 'restart-requested'))).rejects.toThrow();

    await runHarnessTurn(turnInput());
    expect(createSessionCalls[3]?.resumeFrom).toMatchObject({ type: 'resume-session' });
    expect(refreshedBootstraps).toBe(1);
});

test('managed instruction drift reaches the next resumed turn once without rotating its session', async () => {
    await runHarnessTurn(turnInput({ initialRole: 'Own the original lane.' }));
    const firstSession = await readSession();
    await writeFile(
        join(agentRoot, 'session.json'),
        `${JSON.stringify({
            ...firstSession,
            hausAgentAppliedAt: '2026-08-27T12:00:00.000Z',
            hausAgentStatus: 'current',
            hausAgentVersion: '0.9.0',
        })}\n`
    );
    const updateActivity: Array<{ category: string; phase: string }> = [];

    await runHarnessTurn(
        turnInput({
            initialRole: 'Own the updated lane.',
            onActivity: (event) => updateActivity.push(event),
        })
    );

    expect(agentInstructions[0]).toContain('Own the original lane.');
    expect(agentInstructions[1]).toContain('Own the updated lane.');
    expect(agentInstructions[1]).not.toBe(agentInstructions[0]);
    expect(createSessionCalls[1]).toEqual({
        resumeFrom: firstSession.resumeState,
        sessionId: 'engine_session_1',
    });
    expect(stoppedSessions).toBe(0);
    expect(refreshedBootstraps).toBe(0);
    const updatedSession = await readSession();
    expect(updatedSession.generation).toBe(1);
    expect(updatedSession.runtimeSessionId).toBe('engine_session_1');
    expect(updatedSession.hausAgentStatus).toBe('current');
    expect(updatedSession.hausAgentVersion).toBe(hausAgentVersion);
    expect(updatedSession.hausAgentAppliedAt).not.toBe('2026-08-27T12:00:00.000Z');
    expect(updatedSession.instructionFingerprint).not.toBe(firstSession.instructionFingerprint);
    expect(updateActivity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
        { category: 'updating_instructions', phase: 'completed' },
    ]);

    const settledActivity: Array<{ category: string; phase: string }> = [];
    await runHarnessTurn(
        turnInput({
            initialRole: 'Own the updated lane.',
            onActivity: (event) => settledActivity.push(event),
        })
    );

    expect(createSessionCalls[2]?.resumeFrom).toEqual(updatedSession.resumeState);
    expect((await readSession()).generation).toBe(1);
    expect(settledActivity).toEqual([
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
    ]);
    expect(stoppedSessions).toBe(0);
    expect(refreshedBootstraps).toBe(0);
});

test('version-only drift applies once on the same warm session', async () => {
    await runHarnessTurn(turnInput());
    const firstSession = await readSession();
    const previousAppliedAt = '2026-08-27T12:00:00.000Z';
    await writeFile(
        join(agentRoot, 'session.json'),
        `${JSON.stringify({
            ...firstSession,
            hausAgentAppliedAt: previousAppliedAt,
            hausAgentStatus: 'current',
            hausAgentVersion: '0.9.0',
        })}\n`
    );
    const updateActivity: Array<{ category: string; phase: string }> = [];

    await runHarnessTurn(turnInput({ onActivity: (event) => updateActivity.push(event) }));

    expect(agentInstructions[1]).toBe(agentInstructions[0]);
    expect(createSessionCalls[1]).toEqual({
        resumeFrom: firstSession.resumeState,
        sessionId: 'engine_session_1',
    });
    const updatedSession = await readSession();
    expect(updatedSession).toMatchObject({
        bootstrapFingerprint: firstSession.bootstrapFingerprint,
        generation: 1,
        hausAgentStatus: 'current',
        hausAgentVersion,
        instructionFingerprint: firstSession.instructionFingerprint,
        runtimeSessionId: 'engine_session_1',
    });
    expect(updatedSession.hausAgentAppliedAt).not.toBe(previousAppliedAt);
    expect(stoppedSessions).toBe(0);
    expect(refreshedBootstraps).toBe(0);
    expect(updateActivity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
        { category: 'updating_instructions', phase: 'completed' },
    ]);

    const settledActivity: Array<{ category: string; phase: string }> = [];
    await runHarnessTurn(turnInput({ onActivity: (event) => settledActivity.push(event) }));

    expect(settledActivity).toEqual([
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
    ]);
    expect(stoppedSessions).toBe(0);
    expect(refreshedBootstraps).toBe(0);
});

test('an aborted warm instruction and version update retries on the same session', async () => {
    await runHarnessTurn(turnInput({ initialRole: 'Own the original lane.' }));
    const firstSession = await readSession();
    const previousAppliedAt = '2026-08-27T12:00:00.000Z';
    await writeFile(
        join(agentRoot, 'session.json'),
        `${JSON.stringify({
            ...firstSession,
            hausAgentAppliedAt: previousAppliedAt,
            hausAgentStatus: 'current',
            hausAgentVersion: '0.9.0',
        })}\n`
    );
    const runtimeDir = join(agentRoot, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    const restartMarker = join(runtimeDir, 'restart-requested');
    await writeFile(restartMarker, '');
    streamAborts = true;
    const abortedActivity: Array<{ category: string; phase: string }> = [];

    const aborted = await runHarnessTurn(
        turnInput({
            initialRole: 'Own the updated lane.',
            onActivity: (event) => abortedActivity.push(event),
        })
    );

    expect(aborted.aborted).toBe(true);
    const abortedSession = await readSession();
    expect(abortedSession).toMatchObject({
        bootstrapFingerprint: firstSession.bootstrapFingerprint,
        generation: 1,
        hausAgentAppliedAt: previousAppliedAt,
        hausAgentStatus: 'failed',
        hausAgentVersion: '0.9.0',
        instructionFingerprint: firstSession.instructionFingerprint,
        runtimeSessionId: 'engine_session_1',
    });
    expect(abortedSession.resumeState).toMatchObject({ data: { detachSequence: 2 } });
    expect(abortedActivity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'interrupted' },
        { category: 'updating_instructions', phase: 'interrupted' },
    ]);
    expect(stoppedSessions).toBe(1);
    expect(refreshedBootstraps).toBe(1);
    await expect(access(restartMarker)).resolves.toBeNull();

    streamAborts = false;
    const retryActivity: Array<{ category: string; phase: string }> = [];
    await runHarnessTurn(
        turnInput({
            initialRole: 'Own the updated lane.',
            onActivity: (event) => retryActivity.push(event),
        })
    );

    expect(createSessionCalls[3]).toEqual({
        resumeFrom: abortedSession.resumeState,
        sessionId: 'engine_session_1',
    });
    const retriedSession = await readSession();
    expect(retriedSession).toMatchObject({
        generation: 1,
        hausAgentStatus: 'current',
        hausAgentVersion,
        runtimeSessionId: 'engine_session_1',
    });
    expect(retriedSession.hausAgentAppliedAt).not.toBe(previousAppliedAt);
    expect(retriedSession.instructionFingerprint).not.toBe(firstSession.instructionFingerprint);
    expect(stoppedSessions).toBe(2);
    expect(refreshedBootstraps).toBe(2);
    expect(retryActivity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
        { category: 'updating_instructions', phase: 'completed' },
    ]);
    await expect(access(restartMarker)).rejects.toThrow();
});

test('an aborted Restart keeps the current public Haus Agent version current', async () => {
    await runHarnessTurn(turnInput());
    const firstSession = await readSession();
    const runtimeDir = join(agentRoot, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    const restartMarker = join(runtimeDir, 'restart-requested');
    await writeFile(restartMarker, '');
    streamAborts = true;
    const activity: Array<{ category: string; phase: string }> = [];

    const result = await runHarnessTurn(turnInput({ onActivity: (event) => activity.push(event) }));

    expect(result.aborted).toBe(true);
    expect(await readSession()).toMatchObject({
        bootstrapFingerprint: firstSession.bootstrapFingerprint,
        hausAgentAppliedAt: firstSession.hausAgentAppliedAt,
        hausAgentStatus: 'current',
        hausAgentVersion: firstSession.hausAgentVersion,
        instructionFingerprint: firstSession.instructionFingerprint,
        runtimeSessionId: 'engine_session_1',
    });
    expect(activity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'interrupted' },
        { category: 'updating_instructions', phase: 'interrupted' },
    ]);
    expect(stoppedSessions).toBe(1);
    expect(refreshedBootstraps).toBe(1);
    await expect(access(restartMarker)).resolves.toBeNull();
});

test('Cove guidance drift migrates a warm session once and is current when the resumed turn streams', async () => {
    const workspaceDir = join(agentRoot, 'workspace');
    await seedCoveWorkspace(workspaceDir);
    await runHarnessTurn(turnInput({ factoryKind: 'cove' }));
    const firstSession = await readSession();
    await writeFile(join(workspaceDir, 'MEMORY.md'), '# Cove\n\nLearned context.\n');
    await writeFile(join(workspaceDir, 'notes', 'onboarding_objectives.md'), 'owner progress\n');
    await writeFile(join(workspaceDir, 'notes', 'onboarding_playbook.md'), legacyCovePlaybook);
    await writeFile(join(workspaceDir, 'notes', 'onboarding_knowledge_faq.md'), legacyCoveFaq);
    const updateActivity: Array<{ category: string; phase: string }> = [];

    await runHarnessTurn(
        turnInput({
            factoryKind: 'cove',
            onActivity: (event) => updateActivity.push(event),
        })
    );

    expect(createSessionCalls[1]).toEqual({
        resumeFrom: firstSession.resumeState,
        sessionId: 'engine_session_1',
    });
    expect((await readSession()).generation).toBe(1);
    expect(await readFile(join(workspaceDir, 'MEMORY.md'), 'utf8')).toContain('Learned context.');
    expect(await readFile(join(workspaceDir, 'notes', 'onboarding_objectives.md'), 'utf8')).toBe(
        'owner progress\n'
    );
    expect(await readFile(join(workspaceDir, 'notes', 'onboarding_playbook.md'), 'utf8')).toContain(
        'haus agent create'
    );
    expect(streamedCovePlaybooks[1]).toContain('haus agent create');
    expect(streamedCoveFaqs[1]).toContain('haus agent create');
    expect(streamedPrompts[1]).toContain('re-read notes/onboarding_playbook.md');
    expect(updateActivity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
        { category: 'updating_instructions', phase: 'completed' },
    ]);
    expect(stoppedSessions).toBe(0);
    expect(refreshedBootstraps).toBe(0);
    await expect(
        access(join(agentRoot, 'runtime', 'cove-guidance-refresh.json'))
    ).rejects.toThrow();

    const settledActivity: Array<{ category: string; phase: string }> = [];
    await runHarnessTurn(
        turnInput({
            factoryKind: 'cove',
            onActivity: (event) => settledActivity.push(event),
        })
    );

    expect(createSessionCalls).toHaveLength(3);
    expect(streamedPrompts[2]).not.toContain('re-read notes/onboarding_playbook.md');
    expect(settledActivity).toEqual([
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
    ]);
    expect(stoppedSessions).toBe(0);
    expect(refreshedBootstraps).toBe(0);
});

test('an aborted warm Cove guidance refresh keeps its receipt and rereads on retry', async () => {
    const workspaceDir = join(agentRoot, 'workspace');
    await seedCoveWorkspace(workspaceDir);
    await runHarnessTurn(turnInput({ factoryKind: 'cove' }));
    await writeFile(join(workspaceDir, 'notes', 'onboarding_playbook.md'), legacyCovePlaybook);
    await writeFile(join(workspaceDir, 'notes', 'onboarding_knowledge_faq.md'), legacyCoveFaq);
    streamAborts = true;
    const abortedActivity: Array<{ category: string; phase: string }> = [];

    const aborted = await runHarnessTurn(
        turnInput({
            factoryKind: 'cove',
            onActivity: (event) => abortedActivity.push(event),
        })
    );

    expect(aborted.aborted).toBe(true);
    const abortedSession = await readSession();
    expect(abortedSession).toMatchObject({
        hausAgentStatus: 'current',
        hausAgentVersion,
        runtimeSessionId: 'engine_session_1',
    });
    expect(streamedPrompts[1]).toContain('re-read notes/onboarding_playbook.md');
    expect(abortedActivity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'interrupted' },
        { category: 'updating_instructions', phase: 'interrupted' },
    ]);
    await expect(
        access(join(agentRoot, 'runtime', 'cove-guidance-refresh.json'))
    ).resolves.toBeNull();

    streamAborts = false;
    const retryActivity: Array<{ category: string; phase: string }> = [];
    await runHarnessTurn(
        turnInput({
            factoryKind: 'cove',
            onActivity: (event) => retryActivity.push(event),
        })
    );

    expect(createSessionCalls[2]).toEqual({
        resumeFrom: abortedSession.resumeState,
        sessionId: 'engine_session_1',
    });
    expect(streamedPrompts[2]).toContain('re-read notes/onboarding_playbook.md');
    expect(retryActivity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
        { category: 'updating_instructions', phase: 'completed' },
    ]);
    expect(stoppedSessions).toBe(0);
    expect(refreshedBootstraps).toBe(0);
    await expect(
        access(join(agentRoot, 'runtime', 'cove-guidance-refresh.json'))
    ).rejects.toThrow();
});

test('preserves edited Cove guidance and records a failed operator-visible refresh', async () => {
    const workspaceDir = join(agentRoot, 'workspace');
    await mkdir(join(workspaceDir, 'notes'), { recursive: true });
    await writeFile(join(workspaceDir, 'notes', 'onboarding_playbook.md'), 'owner customization\n');
    const activity: Array<{ category: string; phase: string }> = [];

    await runHarnessTurn(
        turnInput({
            factoryKind: 'cove',
            onActivity: (event) => activity.push(event),
        })
    );

    expect(await readFile(join(workspaceDir, 'notes', 'onboarding_playbook.md'), 'utf8')).toBe(
        'owner customization\n'
    );
    expect(activity).toContainEqual({ category: 'updating_instructions', phase: 'started' });
    expect(activity).toContainEqual({ category: 'updating_instructions', phase: 'failed' });
    expect(activity).not.toContainEqual({
        category: 'updating_instructions',
        phase: 'completed',
    });
    expect(streamedPrompts[0]).toContain('could not update');
    expect(await readSession()).toMatchObject({
        hausAgentAppliedAt: null,
        hausAgentStatus: 'failed',
        hausAgentVersion: null,
    });
});

test('retries Cove guidance consumption after a refreshed turn fails', async () => {
    const workspaceDir = join(agentRoot, 'workspace');
    await mkdir(join(workspaceDir, 'notes'), { recursive: true });
    await writeFile(join(workspaceDir, 'notes', 'onboarding_playbook.md'), legacyCovePlaybook);
    await writeFile(join(workspaceDir, 'notes', 'onboarding_knowledge_faq.md'), legacyCoveFaq);
    streamFails = true;
    const failedActivity: Array<{ category: string; phase: string }> = [];

    await expect(
        runHarnessTurn(
            turnInput({
                factoryKind: 'cove',
                onActivity: (event) => failedActivity.push(event),
            })
        )
    ).rejects.toBeInstanceOf(HarnessTurnFailedError);

    expect(failedActivity).toContainEqual({
        category: 'updating_instructions',
        phase: 'failed',
    });
    expect(await readFile(join(workspaceDir, 'notes', 'onboarding_playbook.md'), 'utf8')).toContain(
        'haus agent create'
    );

    streamFails = false;
    const retryActivity: Array<{ category: string; phase: string }> = [];
    await runHarnessTurn(
        turnInput({
            factoryKind: 'cove',
            onActivity: (event) => retryActivity.push(event),
        })
    );

    expect(streamedPrompts[1]).toContain('re-read notes/onboarding_playbook.md');
    expect(retryActivity).toContainEqual({
        category: 'updating_instructions',
        phase: 'completed',
    });
    await expect(
        access(join(agentRoot, 'runtime', 'cove-guidance-refresh.json'))
    ).rejects.toThrow();
});

test('bootstrap drift parks and refreshes the same native session once with current instructions', async () => {
    await runHarnessTurn(turnInput({ initialRole: 'Own the original lane.' }));
    const firstSession = await readSession();
    await writeFile(
        join(agentRoot, 'session.json'),
        `${JSON.stringify({ ...firstSession, bootstrapFingerprint: 'stale' })}\n`
    );
    const updateActivity: Array<{ category: string; phase: string }> = [];

    await runHarnessTurn(
        turnInput({
            initialRole: 'Own the updated lane.',
            onActivity: (event) => updateActivity.push(event),
        })
    );

    expect(createSessionCalls[1]).toEqual({
        resumeFrom: firstSession.resumeState,
        sessionId: 'engine_session_1',
    });
    expect(createSessionCalls[2]).toEqual({
        resumeFrom: {
            data: { nativeSessionId: 'native_session_1' },
            harnessId: 'fake',
            type: 'resume-session',
        },
        sessionId: 'engine_session_1',
    });
    expect(agentInstructions[1]).toContain('Own the updated lane.');
    expect(stoppedSessions).toBe(1);
    expect(refreshedBootstraps).toBe(1);
    const refreshedSession = await readSession();
    expect(refreshedSession.generation).toBe(1);
    expect(refreshedSession.runtimeSessionId).toBe('engine_session_1');
    expect(refreshedSession.bootstrapFingerprint).not.toBe('stale');
    expect(updateActivity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
        { category: 'updating_instructions', phase: 'completed' },
    ]);

    const settledActivity: Array<{ category: string; phase: string }> = [];
    await runHarnessTurn(
        turnInput({
            initialRole: 'Own the updated lane.',
            onActivity: (event) => settledActivity.push(event),
        })
    );

    expect(createSessionCalls[3]).toEqual({
        resumeFrom: refreshedSession.resumeState,
        sessionId: 'engine_session_1',
    });
    expect(createSessionCalls).toHaveLength(4);
    expect((await readSession()).generation).toBe(1);
    expect(stoppedSessions).toBe(1);
    expect(refreshedBootstraps).toBe(1);
    expect(settledActivity).toEqual([
        { category: 'thinking', phase: 'started' },
        { category: 'thinking', phase: 'completed' },
    ]);
});

test('a failed bootstrap refresh stays stale without rejecting the native session', async () => {
    await runHarnessTurn(turnInput());
    const staleSession = await readSession();
    await writeFile(
        join(agentRoot, 'session.json'),
        `${JSON.stringify({ ...staleSession, bootstrapFingerprint: 'stale' })}\n`
    );
    restoreBootstrapRefresh();
    restoreBootstrapRefresh = setHarnessBootstrapRefreshForTesting(async () => {
        throw new Error('bootstrap rejected');
    });
    const activity: Array<{ category: string; phase: string }> = [];

    const failure = await runHarnessTurn(
        turnInput({ onActivity: (event) => activity.push(event) })
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(AgentSessionResumeRejectedError);
    expect((await readSession()).bootstrapFingerprint).toBe('stale');
    expect(activity).toEqual([
        { category: 'updating_instructions', phase: 'started' },
        { category: 'updating_instructions', phase: 'failed' },
    ]);
});

test('a stream failure records a failed instruction refresh and leaves its receipt stale', async () => {
    await runHarnessTurn(turnInput());
    const staleSession = await readSession();
    await writeFile(
        join(agentRoot, 'session.json'),
        `${JSON.stringify({
            ...staleSession,
            hausAgentVersion: '0.9.0',
            instructionFingerprint: 'stale',
        })}\n`
    );
    streamFails = true;
    const activity: Array<{ category: string; phase: string }> = [];

    await expect(
        runHarnessTurn(turnInput({ onActivity: (event) => activity.push(event) }))
    ).rejects.toBeInstanceOf(HarnessTurnFailedError);

    expect((await readSession()).instructionFingerprint).toBe('stale');
    expect(await readSession()).toMatchObject({
        hausAgentStatus: 'failed',
        hausAgentVersion: '0.9.0',
    });
    expect(activity).toContainEqual({ category: 'updating_instructions', phase: 'started' });
    expect(activity).toContainEqual({ category: 'updating_instructions', phase: 'failed' });
    expect(activity).not.toContainEqual({
        category: 'updating_instructions',
        phase: 'completed',
    });
});

test('a rejected resume returns control to the Server without local rotation', async () => {
    await runHarnessTurn(turnInput());
    rejectResume = true;

    await expect(runHarnessTurn(turnInput())).rejects.toBeInstanceOf(
        AgentSessionResumeRejectedError
    );

    // The Server must authorize the next generation before a cold start.
    expect(createSessionCalls[1]?.resumeFrom).toMatchObject({ type: 'resume-session' });
    expect(createSessionCalls).toHaveLength(2);
    expect((await readSession()).generation).toBe(1);
});

test('delivers a pending busy notice into the live harness turn', async () => {
    await runHarnessTurn(turnInput());
    sentUserMessages = [];
    streamIncludesToolBoundary = true;
    const runtimeDir = join(agentRoot, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    const notice =
        '[Haus inbox notice:\nInbox update: 3 unread messages total; 1 changed target\ndm:@operator  pending: 3 messages\n]';
    await writeFile(join(runtimeDir, 'pending-notice.json'), JSON.stringify({ notice }));
    let registeredSink: ((notice: string) => Promise<boolean>) | undefined;
    let unregistered = false;

    await runHarnessTurn(
        turnInput({
            inbox: [],
            registerNoticeSink: (sink) => {
                registeredSink = sink;
                return () => {
                    unregistered = true;
                };
            },
        })
    );

    expect(registeredSink).toBeDefined();
    expect(sentUserMessages).toEqual([notice]);
    expect(unregistered).toBe(true);
    await expect(access(join(runtimeDir, 'pending-notice.json'))).rejects.toThrow();
});

test.each([
    { boundary: true, supported: true },
    { boundary: true, supported: false },
    { boundary: false, supported: true },
])('acknowledges stored busy notices only after supported delivery: %j', async ({
    boundary,
    supported,
}) => {
    await runHarnessTurn(turnInput());
    sentUserMessages = [];
    acceptsUserMessages = supported;
    streamIncludesToolBoundary = boundary;
    const runtimeDir = join(agentRoot, 'runtime');
    const notice = '[Haus inbox notice:\\nInbox update: 1 unread message total\\n]';
    const receipt = { runId: 'run_active', workIds: ['msg_late'] };
    await writeFile(join(runtimeDir, 'pending-notice.json'), JSON.stringify({ notice, receipt }));
    const receipts: (typeof receipt)[] = [];

    await runHarnessTurn(
        turnInput({
            inbox: [],
            onStoredNoticeDelivered: (value) => receipts.push(value),
            totalPending: 0,
        })
    );

    expect(sentUserMessages).toEqual(boundary ? [notice] : []);
    expect(receipts).toEqual(boundary && supported ? [receipt] : []);
    if (boundary && supported) {
        await expect(access(join(runtimeDir, 'pending-notice.json'))).rejects.toThrow();
    } else {
        expect(JSON.parse(await readFile(join(runtimeDir, 'pending-notice.json'), 'utf8'))).toEqual(
            {
                notice,
                receipt,
            }
        );
    }
});

test('defers a stored follow-up notice until the cold turn has a safe live boundary', async () => {
    const runtimeDir = join(agentRoot, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    const notice =
        '[Haus inbox notice:\nInbox update: 1 unread message total; 1 changed target\n#product  pending: 1 message\n]';
    await writeFile(join(runtimeDir, 'pending-notice.json'), JSON.stringify({ notice }));

    await runHarnessTurn(turnInput());

    expect(streamedPrompts[0]).toContain('Hello Cove');
    expect(sentUserMessages).toEqual([]);
    await expect(access(join(runtimeDir, 'pending-notice.json'))).resolves.toBeNull();

    streamIncludesToolBoundary = true;
    await runHarnessTurn(turnInput({ inbox: [], inboxDelivery: 'notice', totalPending: 0 }));

    expect(sentUserMessages).toEqual([notice]);
    await expect(access(join(runtimeDir, 'pending-notice.json'))).rejects.toThrow();
});

test('a resumed DM greeting is not followed by its stale notice from prior task context', async () => {
    const dataRoot = agentRoot;
    const serverId = 'srv_executor_test';
    const resumedRoot = join(dataRoot, 'servers', serverId, 'agents', 'agt_test');
    await mkdir(resumedRoot, { recursive: true });
    const scopedTurn = (inbox: HarnessTurnInput['inbox']) =>
        turnInput({
            agentRoot: resumedRoot,
            homeDir: join(resumedRoot, 'home'),
            inbox,
            skillsDir: join(resumedRoot, 'skills'),
            workspaceDir: join(resumedRoot, 'workspace'),
        });
    await runHarnessTurn(
        scopedTurn([
            {
                chatId: 'cht_product',
                content: 'Upload the new avatar when the app path arrives.',
                createdAt: '2026-08-03T20:00:00.000Z',
                id: 'msg_avatar_task',
                senderHandle: 'operator',
                senderType: 'human',
                sequence: 1,
                target: '#product',
            },
        ])
    );
    sentUserMessages = [];
    const greeting = {
        chatId: 'cht_dm',
        content: 'Hey Blippy!',
        createdAt: '2026-08-03T20:01:00.000Z',
        id: 'msg_dm_greeting',
        senderHandle: 'operator',
        senderType: 'human' as const,
        sequence: 1,
        target: 'dm:@operator',
    };
    const location = { agentId: 'agt_test', dataRoot, serverId };
    await replacePendingInbox(location, [greeting]);
    await acceptRunInbox(location, 'run_greeting', [greeting]);

    await runHarnessTurn(scopedTurn([greeting]));

    expect(createSessionCalls.at(-1)?.resumeFrom).toMatchObject({ type: 'resume-session' });
    expect(streamedPrompts.at(-1)).toContain(
        '[target=dm:@operator msg=dm_greet time=2026-08-03 20:01:00 type=human] @operator: Hey Blippy!'
    );
    expect(streamedPrompts.at(-1)).not.toContain('avatar');
    expect(sentUserMessages).toEqual([]);
});

test('an alive session drains a human message that a cold start only notices', async () => {
    const channel = {
        chatId: 'cht_product',
        content: 'Standup moved to ten.',
        createdAt: '2026-09-20T09:00:00.000Z',
        id: 'msg_standup',
        senderHandle: 'operator',
        senderType: 'human' as const,
        sequence: 3,
        target: '#product',
    };
    const warmDrain = turnInput({
        inbox: [channel],
        inboxDelivery: 'notice',
        totalPending: 1,
        warmDrainItemIds: [channel.id],
    });

    await runHarnessTurn(warmDrain);
    expect(streamedPrompts.at(-1)).toContain('[Haus inbox notice:');
    expect(streamedPrompts.at(-1)).not.toContain('Standup moved to ten.');

    // The session is parked, so the next turn resumes it: the same frame now
    // drains the body instead of noticing it, and injects no second notice.
    await runHarnessTurn(warmDrain);

    expect(createSessionCalls.at(-1)?.resumeFrom).toMatchObject({ type: 'resume-session' });
    expect(streamedPrompts.at(-1)).toContain('Standup moved to ten.');
    expect(streamedPrompts.at(-1)).not.toContain('[Haus inbox notice:');
    expect(sentUserMessages).toEqual([]);
});
