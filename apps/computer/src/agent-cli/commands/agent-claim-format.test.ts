import { expect, test } from 'bun:test';
import { type ClaimRow, formatClaimResults, formatClaimsCreated } from './agent-claim-format.ts';

// A Thread claim's row carries its Thread's own target (`#channel:anchor` or
// `dm:@handle:anchor`). Threads refuse `--reply-to` and cannot nest.
test('a Thread claim names its Thread target with no --reply-to', () => {
    const output = formatClaimResults(
        [
            {
                claimConflict: null,
                number: 7,
                outcome: 'claimed',
                reason: null,
                claim: claimRow('dm:@wren:9f8e7d6c'),
            },
        ],
        'dm:@wren:9f8e7d6c'
    );

    expect(output).toBe(
        'Claim results (1 claimed):\n#7 (msg:1a2b3c4d): claimed · thread reply --target "dm:@wren:9f8e7d6c", no --reply-to\n'
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

test('a Thread claim names the Thread it sits in as its thread address, never a nested target', () => {
    expect(formatClaimsCreated([claimRow('#general:9f8e7d6c')], '#general')).toBe(
        'Created claim #7 [in_progress] in #general:9f8e7d6c. Message ID: msg_1a2b3c4d00000000. Thread: "#general:9f8e7d6c".\n'
    );
});

function claimRow(target: string): ClaimRow {
    return {
        assignee: null,
        message: {
            attachments: [],
            author: { id: 'usr_wren', kind: 'user', label: 'wren', metadata: {} },
            body_kind: 'text',
            chat_id: 'cht_thr_9f8e7d6c00000000',
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
