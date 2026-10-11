import { expect, test } from 'bun:test';
import { canBeginAgentDrain, maxAgentChainTurns, nextAgentChain } from './chain-budget.ts';

const now = new Date('2026-10-11T12:00:00.000Z');

test('allows exactly sixteen consecutive automation-authored drain turns', () => {
    for (const source of ['agent:wren', 'trigger', 'trigger_problem']) {
        expect(canBeginAgentDrain([{ source }], maxAgentChainTurns - 1)).toBe(true);
        expect(canBeginAgentDrain([{ source }], maxAgentChainTurns)).toBe(false);
    }
});

test('human, reminder, and task work resets the chain and stays dispatchable at the ceiling', () => {
    for (const source of ['human', 'reminder', 'task']) {
        const rows = [{ source: 'trigger' }, { source }];
        expect(canBeginAgentDrain(rows, maxAgentChainTurns)).toBe(true);
        expect(nextAgentChain(rows, maxAgentChainTurns, now)).toEqual({
            agentChainAdvancedAt: null,
            agentChainTurns: 0,
        });
    }
});

test('completed automation drains spend one chain turn and stamp when', () => {
    expect(nextAgentChain([{ source: 'agent:wren' }], 7, now)).toEqual({
        agentChainAdvancedAt: now,
        agentChainTurns: 8,
    });
    expect(nextAgentChain([{ source: 'trigger' }, { source: 'trigger_problem' }], 0, now)).toEqual({
        agentChainAdvancedAt: now,
        agentChainTurns: 1,
    });
});

test('notice-only turns leave the current chain budget unchanged at the settlement boundary', () => {
    expect(nextAgentChain([], 7, now)).toBe(null);
});
