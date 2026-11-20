import { expect, test } from 'bun:test';
import {
    agentActions,
    canRunAgentActions,
    disabledAgentActions,
    fullResetConfirmation,
} from './agent-actions-model.ts';

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

test('the Full reset confirmation names what it deletes and how to get it back', () => {
    expect(fullResetConfirmation('Scout')).toBe(
        "Deletes Scout's memory, notes, skills and rules, then restores a starter MEMORY.md and the factory skills in a fresh session. You can restore any of them from Recently deleted in Drive for 30 days."
    );
});
