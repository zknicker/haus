import { expect, test } from 'bun:test';
import { parseStartCommand } from '../agent-command-frames.ts';
import {
    composeTurnPrompt,
    dreamTurnLine,
    type TurnDelivery,
    turnDeliveryOf,
} from './turn-prompt.ts';

const dream = { createdAt: '2026-10-11T03:10:00.000Z', id: 'dream:agt_test:2026-10-11' };

const dreamFrame = {
    agentId: 'agt_test',
    chatId: null,
    dream,
    drainItemIds: [],
    inbox: [],
    inboxDelivery: 'concrete',
    modelId: 'm',
    runId: 'run_dream',
    runtimeId: 'codex',
    sessionGeneration: 2,
    totalPending: 0,
    type: 'start',
    unreadElsewhere: [],
    warmDrainItemIds: [],
};

function delivery(overrides: Partial<TurnDelivery> = {}): TurnDelivery {
    return {
        agentId: 'agt_test',
        dataRoot: '/tmp/unused',
        dream,
        drainItemIds: [],
        homeTimezone: 'UTC',
        inbox: [],
        inboxDelivery: 'concrete',
        runId: 'run_dream',
        serverId: 'srv_test',
        totalPending: 0,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        ...overrides,
    };
}

test('a dream frame parses chatless, and only a dream frame may', () => {
    const command = parseStartCommand(dreamFrame);
    expect(command).toMatchObject({ chatId: null, dream, inboxDelivery: 'concrete' });
    expect(command && turnDeliveryOf(command).dream).toEqual(dream);

    expect(parseStartCommand({ ...dreamFrame, dream: undefined })).toBeNull();
    expect(parseStartCommand({ ...dreamFrame, chatId: 'cht_1' })).toBeNull();
    expect(parseStartCommand({ ...dreamFrame, inboxDelivery: 'notice' })).toBeNull();
    expect(parseStartCommand({ ...dreamFrame, drainItemIds: ['msg_1'] })).toBeNull();
    expect(parseStartCommand({ ...dreamFrame, dream: { id: 'x' } })).toBeNull();
    expect(parseStartCommand({ ...dreamFrame, chatId: 'cht_1', dream: undefined })?.chatId).toBe(
        'cht_1'
    );
});

test('a dream turn is only the dreaming instruction: no inbox, notice, or digest', () => {
    const warm = composeTurnPrompt(delivery(), { isColdStart: false, sessionGeneration: 2 });
    expect(warm).toEqual({ drained: [], notice: null, turnContent: dreamTurnLine });
    expect(dreamTurnLine).toContain('haus manual get recipes/technique/memory-hygiene');
    expect(dreamTurnLine).toContain('Post nothing in any chat about the dream itself');
    expect(dreamTurnLine).toContain('handle them normally');

    // A fresh later generation keeps the recovery line ahead of the pass.
    const cold = composeTurnPrompt(delivery(), { isColdStart: true, sessionGeneration: 2 });
    expect(cold.turnContent).toContain('Fresh session');
    expect(cold.turnContent.endsWith(dreamTurnLine)).toBe(true);
    expect(cold.turnContent).not.toContain('Start.');
});
