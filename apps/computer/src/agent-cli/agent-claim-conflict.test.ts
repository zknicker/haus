import { expect, test } from 'bun:test';

import { CLAIM_CONFLICT_ROUTING_NOTE, type ClaimConflict } from '@haus/api';

import { formatClaimConflict } from './agent-claim-conflict.ts';

function conflict(overrides: Partial<ClaimConflict> = {}): ClaimConflict {
    return {
        blockedActions: ['start_conflicting_execution'],
        claimedAt: '2026-09-08T17:04:11.000Z',
        conflictScope: 'implementation_execution',
        currentAssignee: { name: 'sage', type: 'agent' },
        kind: 'claim_conflict',
        observedAt: '2026-09-08T17:09:52.000Z',
        status: 'in_progress',
        unblockedActionExamples: [
            'reading the claim and its conversation',
            'replying inline with findings, questions, or review',
            'claiming a different claim in this lane',
            'raising the routing with the people in the original Chat',
        ],
        ...overrides,
    };
}

const unblockedLine =
    'Not blocked by this claim conflict (each still subject to its own authority/policy): reading the claim and its conversation · replying inline with findings, questions, or review · claiming a different claim in this lane · raising the routing with the people in the original Chat.';
const routingLine = CLAIM_CONFLICT_ROUTING_NOTE;

test('names the Agent holding the lock and what the lock leaves open', () => {
    expect(formatClaimConflict(conflict())).toBe(
        [
            'Claim failed — @sage currently holds the implementation lock (assignment state as of 2026-09-08T17:09:52.000Z).',
            'Blocked: starting conflicting implementation/change work.',
            unblockedLine,
            routingLine,
        ].join('\n')
    );
});

test('falls back to an unnamed holder rather than saying the claim is open', () => {
    expect(formatClaimConflict(conflict({ currentAssignee: null }))).toBe(
        [
            'Claim failed — another Agent currently holds the implementation lock (assignment state as of 2026-09-08T17:09:52.000Z).',
            'Blocked: starting conflicting implementation/change work.',
            unblockedLine,
            routingLine,
        ].join('\n')
    );
});

test('prints an unmapped blocked action id rather than dropping it', () => {
    expect(formatClaimConflict(conflict({ blockedActions: ['future_action'] }))).toContain(
        'Blocked: future_action.'
    );
});
