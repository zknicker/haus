import { expect, test } from 'bun:test';
import type { TaskClaimConflict } from '@haus/api';
import { formatTaskClaimConflict } from './agent-claim-conflict.ts';

function conflict(overrides: Partial<TaskClaimConflict> = {}): TaskClaimConflict {
    return {
        blockedActions: ['start_conflicting_execution'],
        claimedAt: '2026-09-08T17:04:11.000Z',
        conflictScope: 'implementation_execution',
        currentAssignee: { name: 'sage', type: 'agent' },
        kind: 'claim_conflict',
        observedAt: '2026-09-08T17:09:52.000Z',
        status: 'in_progress',
        unblockedActionExamples: [
            'reading the task and its Thread',
            'replying in the Thread with findings, questions, or review',
            'claiming a different task in this lane',
            'raising the routing with the people in the original Chat',
        ],
        ...overrides,
    };
}

const unblockedLine =
    'Not blocked by this claim conflict (each still subject to its own authority/policy): reading the task and its Thread · replying in the Thread with findings, questions, or review · claiming a different task in this lane · raising the routing with the people in the original Chat.';
const routingLine =
    'This is not a ruling on who owns or leads this lane. If you are its canonical owner or believe it is misrouted: correct the routing in the original thread.';

test('names the Agent holding the lock and what the lock leaves open', () => {
    expect(formatTaskClaimConflict(conflict())).toBe(
        [
            'Claim failed — @sage currently holds the implementation lock (assignment state as of 2026-09-08T17:09:52.000Z).',
            'Blocked: starting conflicting implementation/change work.',
            unblockedLine,
            routingLine,
        ].join('\n')
    );
});

test('falls back to an unnamed holder rather than claiming the task is open', () => {
    expect(formatTaskClaimConflict(conflict({ currentAssignee: null }))).toBe(
        [
            'Claim failed — another Agent currently holds the implementation lock (assignment state as of 2026-09-08T17:09:52.000Z).',
            'Blocked: starting conflicting implementation/change work.',
            unblockedLine,
            routingLine,
        ].join('\n')
    );
});

test('prints an unmapped blocked action id rather than dropping it', () => {
    expect(formatTaskClaimConflict(conflict({ blockedActions: ['future_action'] }))).toContain(
        'Blocked: future_action.'
    );
});
