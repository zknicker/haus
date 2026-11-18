import { expect, test } from 'bun:test';
import {
    agentActions,
    canRunAgentActions,
    disabledAgentActions,
    fullResetCopy,
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

test('describes the factory state restored for each Agent kind', () => {
    expect(fullResetCopy('ordinary')).toEqual({
        confirmation:
            "This starts a fresh session and permanently wipes the Agent's workspace, MEMORY.md, skills, and runtime-local state. A minimal MEMORY.md and factory-managed skills are restored. Identity, Chat history, model configuration, and connections are kept.",
        description: 'Start fresh and restore a minimal MEMORY.md and factory-managed skills.',
    });
    expect(fullResetCopy('cove')).toEqual({
        confirmation:
            "This starts a fresh session and permanently wipes Cove's workspace, MEMORY.md, skills, and runtime-local state. Cove's factory onboarding workspace and factory-managed skills are restored. Identity, Chat history, model configuration, and connections are kept.",
        description:
            "Start fresh and restore Cove's factory onboarding workspace and factory-managed skills.",
    });
});
