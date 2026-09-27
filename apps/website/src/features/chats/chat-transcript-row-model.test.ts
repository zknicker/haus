import { expect, test } from 'bun:test';
import type { TranscriptEntry, TranscriptItem } from './chat-transcript-model.ts';
import { buildTranscriptRenderRows } from './chat-transcript-row-model.ts';

test('day dividers appear only above rendered rows', () => {
    const rows = buildTranscriptRenderRows(
        [
            userTurn('user-1', '2026-07-13T10:00:00.000Z'),
            hiddenAgentTurn('agent-hidden', '2026-07-14T09:00:00.000Z'),
        ],
        0
    );

    expect(rows.map((row) => row.id)).toEqual(['day:2026-6-13', 'user-1']);
});

test('a rendered entry after a hidden one still opens its day', () => {
    const rows = buildTranscriptRenderRows(
        [
            userTurn('user-1', '2026-07-13T10:00:00.000Z'),
            hiddenAgentTurn('agent-hidden', '2026-07-14T09:00:00.000Z'),
            userTurn('user-2', '2026-07-14T09:05:00.000Z'),
        ],
        0
    );

    expect(rows.map((row) => row.id)).toEqual([
        'day:2026-6-13',
        'user-1',
        'day:2026-6-14',
        'user-2',
    ]);
});

function userTurn(id: string, timestamp: string): TranscriptEntry {
    return {
        actor: { id: 'usr_demo', kind: 'profile', name: 'Demo' },
        id,
        items: [messageItem(id)],
        key: id,
        kind: 'turn',
        participant: 'user',
        responseId: null,
        showReplyReference: true,
        timestamp,
    } as TranscriptEntry;
}

// An agent turn whose only item is a plain tool row renders nothing in the
// chat pane, so it must not emit a day divider either.
function hiddenAgentTurn(id: string, timestamp: string): TranscriptEntry {
    return {
        actor: { id: 'agt_demo', kind: 'profile', name: 'Otto' },
        id,
        items: [{ kind: 'row', row: { id: `${id}-tool`, kind: 'tool' } } as TranscriptItem],
        key: id,
        kind: 'turn',
        participant: 'agent',
        responseId: null,
        showReplyReference: true,
        timestamp,
    } as TranscriptEntry;
}

function messageItem(id: string): TranscriptItem {
    return { kind: 'row', row: { id: `${id}-message`, kind: 'message' } } as TranscriptItem;
}
