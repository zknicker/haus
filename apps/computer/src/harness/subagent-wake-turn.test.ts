import { expect, test } from 'bun:test';
import { parseStartCommand, parseStopBackgroundCommand } from '../agent-command-frames.ts';
import {
    composeTurnPrompt,
    subagentWakeTurnLine,
    type TurnDelivery,
    turnDeliveryOf,
} from './turn-prompt.ts';

const subagentWake = { createdAt: '2026-10-21T10:00:00.000Z', id: 'subagent:agt_test:wake_1' };

const wakeFrame = {
    agentId: 'agt_test',
    chatId: null,
    drainItemIds: [],
    inbox: [],
    inboxDelivery: 'concrete',
    modelId: 'm',
    runId: 'run_wake',
    runtimeId: 'claude-code',
    sessionGeneration: 2,
    subagentWake,
    totalPending: 0,
    type: 'start',
    unreadElsewhere: [],
    warmDrainItemIds: [],
};

function delivery(overrides: Partial<TurnDelivery> = {}): TurnDelivery {
    return {
        agentId: 'agt_test',
        dataRoot: '/tmp/unused',
        drainItemIds: [],
        homeTimezone: 'UTC',
        inbox: [],
        inboxDelivery: 'concrete',
        runId: 'run_wake',
        serverId: 'srv_test',
        subagentWake,
        totalPending: 0,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        ...overrides,
    };
}

test('a sub-agent wake frame parses chatless, and never beside a dream or a Chat', () => {
    const command = parseStartCommand(wakeFrame);
    expect(command).toMatchObject({ chatId: null, inboxDelivery: 'concrete', subagentWake });
    expect(command && turnDeliveryOf(command).subagentWake).toEqual(subagentWake);

    expect(parseStartCommand({ ...wakeFrame, chatId: 'cht_1' })).toBeNull();
    expect(parseStartCommand({ ...wakeFrame, inboxDelivery: 'notice' })).toBeNull();
    expect(parseStartCommand({ ...wakeFrame, drainItemIds: ['msg_1'] })).toBeNull();
    expect(parseStartCommand({ ...wakeFrame, subagentWake: { id: 'x' } })).toBeNull();
    expect(
        parseStartCommand({ ...wakeFrame, dream: { ...subagentWake, id: 'dream:agt_test:d' } })
    ).toBeNull();
});

test('a wake with nothing to adopt prompts the Agent to report or stop', () => {
    const warm = composeTurnPrompt(delivery(), { isColdStart: false, sessionGeneration: 2 });
    expect(warm).toEqual({ drained: [], notice: null, turnContent: subagentWakeTurnLine });
    expect(subagentWakeTurnLine).toContain('finished or stopped');
    expect(subagentWakeTurnLine).toContain('Otherwise stop.');
    // After a Computer restart the session may cold-start into a later generation.
    const cold = composeTurnPrompt(delivery(), { isColdStart: true, sessionGeneration: 3 });
    expect(cold.turnContent.endsWith(subagentWakeTurnLine)).toBe(true);
});

test('a Stop of background work parses fail-closed', () => {
    expect(parseStopBackgroundCommand({ agentId: 'agt_1', type: 'agent-stop-background' })).toEqual(
        { agentId: 'agt_1', type: 'agent-stop-background' }
    );
    expect(parseStopBackgroundCommand({ agentId: '', type: 'agent-stop-background' })).toBeNull();
    expect(parseStopBackgroundCommand({ agentId: 'agt_1', runId: 'r', type: 'stop' })).toBeNull();
});
