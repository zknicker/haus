import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { AgentTurnTimings } from '../agent-turn-timings.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { type HarnessAgentFactory, runHarnessTurn } from './executor.ts';

test('records native startup and stream boundaries without inventing message sends', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-turn-timings-'));
    const runtime = makeDaemonRuntime();
    const timings = new AgentTurnTimings();
    const session = {
        isResume: false,
        sessionId: 'test-session',
        detach: async () => ({ type: 'resume-session', harnessId: 'fake', data: {} }),
        destroy: async () => {},
    } as unknown as HarnessAgentSession;
    const factory: HarnessAgentFactory = () => ({
        createSession: async () => session,
        stream: (async () => ({
            fullStream: (async function* () {
                yield { type: 'tool-call', toolCallId: 'call_one', toolName: 'read' };
                yield { type: 'tool-result', toolCallId: 'call_one', toolName: 'read', result: {} };
                yield { type: 'finish', totalUsage: { inputTokens: 10, outputTokens: 2 } };
            })(),
        })) as unknown as ReturnType<HarnessAgentFactory>['stream'],
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
            harnessAgentFactory: factory,
            homeDir: join(root, 'home'),
            homeTimezone: 'UTC',
            inbox: [],
            drainItemIds: [],
            inboxDelivery: 'notice',
            serverId: 'srv_test',
            unreadElsewhere: [],
            warmDrainItemIds: [],
            initialRole: null,
            modelId: 'test-model',
            reasoningEffort: 'high',
            runId: 'run_timing',
            runtime,
            runtimeId: 'codex',
            sessionGeneration: 1,
            skillsDir: join(root, 'skills'),
            tools: {},
            totalPending: 0,
            turnTimings: timings,
            webAccess: null,
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
