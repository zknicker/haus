import { expect, test } from 'bun:test';
import { claimConflictSchema } from '@haus/api';
import {
    type ClaimRow,
    claimResultSchema,
    formatClaimResults,
    formatClaimsCreated,
} from './agent-claim-format.ts';

test('a claim in a Task names the inline reply in that Task', () => {
    const output = formatClaimResults(
        [
            {
                claimConflict: null,
                number: 7,
                outcome: 'claimed',
                reason: null,
                claim: claimRow('task:SEC-12'),
            },
        ],
        'task:SEC-12'
    );

    expect(output).toBe(
        'Claim results (1 claimed):\n#7 (msg:1a2b3c4d): claimed · inline reply --target "task:SEC-12" --reply-to 1a2b3c4d\n'
    );
});

test('a top-level claim keeps the inline reply to its message', () => {
    const output = formatClaimResults(
        [
            {
                claimConflict: null,
                number: 7,
                outcome: 'already_yours',
                reason: null,
                claim: claimRow('#general'),
            },
        ],
        '#general'
    );

    expect(output).toContain(
        'already yours · inline reply --target "#general" --reply-to 1a2b3c4d'
    );
});

test('a created claim names where it sits and its message id, with no thread address', () => {
    expect(formatClaimsCreated([claimRow('#general')], '#general')).toBe(
        'Created claim #7 [in_progress] in #general. Message ID: msg_1a2b3c4d00000000.\n'
    );
});

/**
 * A current Server's claim conflict, plus a field a future Server release
 * might additively send. Before the loosened `claimResultSchema`, this
 * field stranded `haus claim`'s whole response.
 */
const claimConflictWithUnknownField = {
    blockedActions: ['implementation_execution'],
    claimedAt: '2026-11-02T20:00:00.000Z',
    conflictScope: 'implementation_execution',
    currentAssignee: { name: 'wren', type: 'agent' },
    futureConflictField: true,
    kind: 'claim_conflict',
    observedAt: '2026-11-02T20:05:00.000Z',
    status: 'in_progress',
    unblockedActionExamples: [],
};

test('the canonical strict claim conflict schema rejects a field it does not know', () => {
    expect(() => claimConflictSchema.parse(claimConflictWithUnknownField)).toThrow(
        /futureConflictField/
    );
});

test('the Computer response schema tolerates an unknown field on a claim conflict', () => {
    const parsed = claimResultSchema.parse({
        claim: null,
        claimConflict: claimConflictWithUnknownField,
        number: 7,
        outcome: 'refused',
        reason: 'Held by @wren.',
    });
    expect(parsed.claimConflict?.currentAssignee?.name).toBe('wren');
});

function claimRow(target: string): ClaimRow {
    return {
        assignee: null,
        message: {
            attachments: [],
            author: { id: 'usr_wren', kind: 'user', label: 'wren', metadata: {} },
            body_kind: 'text',
            chat_id: 'cht_general',
            content: 'Set up the export',
            created_at: '2026-11-02T20:00:00.000Z',
            deleted_at: null,
            delivery_id: null,
            id: 'msg_1a2b3c4d00000000',
            metadata: {},
            nonce: 'claim-format-test',
            role: 'user',
            sender: { description: null, handle: 'wren', type: 'human' },
            sequence: 1,
        },
        number: 7,
        status: 'in_progress',
        target,
        version: 3,
    };
}
