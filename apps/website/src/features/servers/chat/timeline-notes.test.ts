import { expect, test } from 'bun:test';
import { projectPendingChatMessageRows } from './pending-messages.tsx';
import { mergeTimelineNotes } from './timeline-notes.ts';

function messageRows(times: readonly string[]) {
    return projectPendingChatMessageRows(
        times.map((createdAt, index) => ({
            attachments: [],
            content: `message ${index}`,
            createdAt,
            messageId: null,
            nonce: `n${index}`,
            reply: null,
            submittedAt: createdAt,
        })),
        'usr_viewer'
    );
}

test('notes join the messages by time as quiet system rows', () => {
    const rows = messageRows(['2026-11-26T10:00:00Z', '2026-11-26T10:02:00Z']);
    const merged = mergeTimelineNotes(rows, [
        { id: 'late', text: 'OVER-7 archived', timestamp: '2026-11-26T10:03:00Z' },
        { id: 'mid', text: 'OVER-7 finished, worked for 23s', timestamp: '2026-11-26T10:01:00Z' },
    ]);
    expect(merged.map((row) => row.id)).toEqual(['pending:n0', 'mid', 'pending:n1', 'late']);
    expect(merged[1]?.message).toMatchObject({
        content: 'OVER-7 finished, worked for 23s',
        senderType: 'system',
    });
});

test('a note older than the oldest loaded message waits for that history', () => {
    const rows = messageRows(['2026-11-26T10:00:00Z']);
    expect(
        mergeTimelineNotes(rows, [
            { id: 'old', text: 'OVER-1 archived', timestamp: '2026-11-25T10:00:00Z' },
        ])
    ).toBe(rows);
    expect(
        mergeTimelineNotes(
            [],
            [{ id: 'only', text: 'OVER-1 archived', timestamp: '2026-11-25T10:00:00Z' }]
        ).map((row) => row.id)
    ).toEqual(['only']);
});
