import { expect, test } from 'bun:test';
import { formatTaskClaims, formatTasksCreated, type TaskRow } from './agent-task-format.ts';

// A Thread task's row carries its Thread's own target (`#channel:anchor` or
// `dm:@handle:anchor`). Threads refuse `--reply-to` and cannot nest.
test('a Thread task claim names its Thread target with no --reply-to', () => {
    const output = formatTaskClaims(
        [
            {
                claimConflict: null,
                number: 7,
                outcome: 'claimed',
                reason: null,
                task: taskRow('dm:@wren:9f8e7d6c'),
            },
        ],
        'dm:@wren:9f8e7d6c'
    );

    expect(output).toBe(
        'Claim results (1 claimed):\n#7 (msg:1a2b3c4d): claimed · thread reply --target "dm:@wren:9f8e7d6c", no --reply-to\n'
    );
});

test('a top-level task claim keeps the inline reply to its message', () => {
    const output = formatTaskClaims(
        [
            {
                claimConflict: null,
                number: 7,
                outcome: 'already_yours',
                reason: null,
                task: taskRow('#general'),
            },
        ],
        '#general'
    );

    expect(output).toContain(
        'already yours · inline reply --target "#general" --reply-to 1a2b3c4d'
    );
});

test('a Thread task names the Thread it sits in as its thread address, never a nested target', () => {
    expect(formatTasksCreated([taskRow('#general:9f8e7d6c')], '#general')).toBe(
        'Created task #7 [in_progress] in #general:9f8e7d6c. Message ID: msg_1a2b3c4d00000000. Thread: "#general:9f8e7d6c".\n'
    );
});

function taskRow(target: string): TaskRow {
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
            nonce: 'task-format-test',
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
