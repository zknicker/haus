import { expect, test } from 'bun:test';
import { agentActions, canRunAgentActions, disabledAgentActions } from './agent-actions-model.ts';

test('only Owners and Admins reach the Agent actions menu', () => {
    expect(canRunAgentActions('owner')).toBe(true);
    expect(canRunAgentActions('admin')).toBe(true);
    expect(canRunAgentActions('member')).toBe(false);
});

test('Stop needs a running turn; everything else stays available', () => {
    expect(disabledAgentActions({ isPending: false, isRunning: true })).toEqual([]);
    expect(disabledAgentActions({ isPending: false, isRunning: false })).toEqual(['stop']);
});

test('a lifecycle mutation in flight makes the whole menu inert', () => {
    expect(disabledAgentActions({ isPending: true, isRunning: true })).toEqual([...agentActions]);
});
