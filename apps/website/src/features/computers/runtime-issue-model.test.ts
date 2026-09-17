import { expect, test } from 'bun:test';
import {
    agentRuntimeIssue,
    runtimeIssueLabel,
    runtimeLoginCommand,
} from './runtime-issue-model.ts';

const inventory = {
    runtimes: [],
    runtimeIssues: [
        {
            runtimeId: 'grok-build' as const,
            kind: 'authentication' as const,
            observedAt: '2026-09-17T17:00:00.000Z',
        },
    ],
};
test('only agents using the affected Computer runtime show its issue', () => {
    expect(
        agentRuntimeIssue(
            { effectiveRuntimeId: 'grok-build', desiredRuntimeId: 'grok-build' },
            inventory
        )
    ).toEqual(inventory.runtimeIssues[0]);
    expect(
        agentRuntimeIssue({ effectiveRuntimeId: 'codex', desiredRuntimeId: 'codex' }, inventory)
    ).toBeNull();
    expect(
        agentRuntimeIssue({ effectiveRuntimeId: null, desiredRuntimeId: 'grok-build' }, inventory)
    ).toEqual(inventory.runtimeIssues[0]);
    expect(
        agentRuntimeIssue(
            { effectiveRuntimeId: 'grok-build', desiredRuntimeId: 'grok-build' },
            { runtimes: [] }
        )
    ).toBeNull();
});
test('recovery copy names the runtime and its native login command', () => {
    expect(runtimeIssueLabel('grok-build')).toBe('Grok Build sign-in required');
    expect(runtimeLoginCommand('grok-build')).toBe('grok login');
    expect(runtimeLoginCommand('pi')).toBeNull();
});
