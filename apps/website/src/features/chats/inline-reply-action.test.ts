import { expect, test } from 'bun:test';
import type { TranscriptItem } from './chat-transcript-model.ts';
import { getInlineReplyTargetRow } from './inline-reply-action.tsx';
import type { TranscriptMessageRow } from './transcript-contract.ts';

test('Reply follows the hovered message inside a grouped human turn', () => {
    const original = messageRow('msg_original');
    const later = messageRow('msg_later');
    const items: TranscriptItem[] = [
        { kind: 'row', row: original },
        { kind: 'row', row: later },
    ];

    expect(getInlineReplyTargetRow(items, original.id, later)?.message.id).toBe(original.id);
});

function messageRow(id: string): TranscriptMessageRow {
    return {
        actor: null,
        connectsToNext: false,
        connectsToPrevious: false,
        id,
        isFirstInGroup: true,
        kind: 'message',
        message: {
            content: id,
            id,
            sender: 'You',
            senderType: 'user',
            sourceSessionId: null,
            sourceSessionKey: 'session-1',
            timestamp: '2026-09-08T12:00:00.000Z',
        },
    };
}
