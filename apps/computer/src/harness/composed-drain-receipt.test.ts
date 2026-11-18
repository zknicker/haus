import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import type { AgentInboxItem } from '../agent-inbox-item.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { fakeRuntimeDriver, finishedTurn } from '../runtime/testing/fake-runtime-driver.ts';
import { type HarnessTurnInput, runHarnessTurn } from './executor.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

let agentRoot: string;
let events: string[];

beforeEach(async () => {
    agentRoot = await mkdtemp(join(tmpdir(), 'haus-drain-receipt-'));
    events = [];
});

afterEach(async () => {
    await rm(agentRoot, { force: true, recursive: true });
});

const dm: AgentInboxItem = {
    addressed: true,
    addressedReason: 'dm',
    chatId: 'cht_dm',
    content: 'Can you look at the deploy?',
    createdAt: '2026-09-23T10:00:00.000Z',
    id: 'msg_deploy01',
    senderHandle: 'operator',
    senderType: 'human',
    sequence: 4,
    target: 'dm:@operator',
};

const channel: AgentInboxItem = {
    chatId: 'cht_product',
    content: 'Standup moved to ten.',
    createdAt: '2026-09-23T10:01:00.000Z',
    id: 'msg_standup1',
    senderHandle: 'operator',
    senderType: 'human',
    sequence: 9,
    target: '#product',
};

const { factory: fakeDriver } = fakeRuntimeDriver<HarnessTurnInput>({
    turn: () => {
        events.push('stream');
        return finishedTurn();
    },
});

function turnInput(overrides: Partial<HarnessTurnInput>): HarnessTurnInput {
    return {
        activity: new AgentActivityRun(runtime, () => undefined),
        agentId: 'agt_receipt',
        agentName: 'Cove',
        agentRoot,
        attestVisible: async (identities) => {
            events.push(`receipt:${identities.map(({ id }) => id).join(',')}`);
            return identities;
        },
        dataRoot: agentRoot,
        drainItemIds: [],
        env: {},
        factoryKind: 'ordinary',
        runtimeDriverFactory: fakeDriver,
        homeDir: join(agentRoot, 'home'),
        homeTimezone: 'UTC',
        inbox: [],
        inboxDelivery: 'notice',
        initialRole: null,
        modelId: 'gpt-5.6-sol',
        reasoningEffort: 'medium',
        runId: 'run_receipt',
        runtime,
        runtimeId: 'codex',
        serverId: 'srv_receipt',
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

test('composition reports drained identities to the Server before the model streams', async () => {
    // Cold: only the addressed DM drains, and the Server hears about it first.
    await runHarnessTurn(
        turnInput({
            drainItemIds: [dm.id],
            inbox: [dm, channel],
            totalPending: 2,
            warmDrainItemIds: [channel.id],
        })
    );
    expect(events).toEqual([`receipt:${dm.id}`, 'stream']);

    // Warm: the resumed session drains the wake message it will answer.
    events = [];
    await runHarnessTurn(
        turnInput({
            inbox: [channel],
            runId: 'run_receipt_warm',
            totalPending: 1,
            warmDrainItemIds: [channel.id],
        })
    );
    expect(events).toEqual([`receipt:${channel.id}`, 'stream']);
});

test('a turn that drains nothing sends no visibility receipt', async () => {
    await runHarnessTurn(turnInput({ inbox: [channel], totalPending: 1 }));

    expect(events).toEqual(['stream']);
});
