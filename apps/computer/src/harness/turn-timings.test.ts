import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { AgentTurnTimings } from '../agent-turn-timings.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import type { RuntimeSession } from '../runtime/driver.ts';
import { runHarnessTurn, type TurnDriverFactory } from './executor.ts';

test('records native startup and stream boundaries without inventing message sends', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-turn-timings-'));
    const runtime = makeDaemonRuntime();
    const timings = new AgentTurnTimings();
    const session: RuntimeSession = {
        isResume: false,
        sessionId: 'test-session',
        detach: async () => ({ runtime: 'codex', threadId: 'test-thread', version: 1 }),
        destroy: async () => {},
        startTurn: async () => ({
            events: (async function* () {
                yield { input: {}, type: 'tool-call', toolCallId: 'call_one', toolName: 'read' };
                yield { type: 'tool-result', toolCallId: 'call_one', toolName: 'read', output: {} };
                yield {
                    claudePlanUsage: null,
                    type: 'turn-finish',
                    usage: {
                        cacheReadTokens: 0,
                        cacheWriteTokens: 0,
                        inputTokens: 10,
                        outputTokens: 2,
                        totalTokens: 12,
                    },
                };
            })(),
            settle: async () => undefined,
            unconsumedSteers: () => [],
        }),
        steer: async () => ({ delivered: false, reason: 'idle' }),
        stop: async () => ({ runtime: 'codex', threadId: 'test-thread', version: 1 }),
    };
    const factory: TurnDriverFactory = () => ({
        bootstrapFingerprint: async () => null,
        openSession: async () => session,
        refreshBootstrap: async () => undefined,
        runtimeId: 'codex',
    });
    try {
        await runHarnessTurn({
            activity: new AgentActivityRun(runtime, () => {}),
            agentId: 'agt_timing',
            agentName: 'Timing',
            agentRoot: root,
            dataRoot: root,
            env: {},
            factoryKind: 'ordinary',
            runtimeDriverFactory: factory,
            homeDir: join(root, 'home'),
            homeTimezone: 'UTC',
            inbox: [],
            drainItemIds: [],
            inboxDelivery: 'notice',
            serverId: 'srv_test',
            unreadElsewhere: [],
            warmDrainItemIds: [],
            initialRole: null,
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runId: 'run_timing',
            runtime,
            runtimeId: 'codex',
            sessionGeneration: 1,
            skillsDir: join(root, 'skills'),
            tools: [],
            totalPending: 0,
            turnTimings: timings,
            workspaceDir: join(root, 'workspace'),
        });
        expect(timings.snapshot()).toMatchObject({
            'haus.reasoning.effort': 'high',
            'haus.turn.harness_ready_ms': expect.any(Number),
            'haus.turn.session_create_ms': expect.any(Number),
            'haus.turn.first_stream_ms': expect.any(Number),
            'haus.turn.first_tool_ms': expect.any(Number),
        });
        expect(timings.snapshot()['haus.turn.first_send_ms']).toBeUndefined();
    } finally {
        await runtime.dispose();
        await rm(root, { recursive: true, force: true });
    }
});
