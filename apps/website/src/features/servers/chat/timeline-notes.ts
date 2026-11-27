import { withLocalTimelineMessageMetadata } from '../../chats/local-timeline-message.ts';
import type { ProjectedChatMessageRow } from './chat-message-model.ts';

export interface TimelineNote {
    id: string;
    text: string;
    timestamp: string;
}

export function mergeTimelineNotes(
    rows: ProjectedChatMessageRow[],
    notes: readonly TimelineNote[]
) {
    const oldest = rows[0] ? Date.parse(rows[0].message.timestamp) : Number.NEGATIVE_INFINITY;
    const shown: ProjectedChatMessageRow[] = notes
        .filter((note) => Date.parse(note.timestamp) >= oldest)
        .map(noteRow)
        .sort((a, b) => Date.parse(a.message.timestamp) - Date.parse(b.message.timestamp));
    if (shown.length === 0) {
        return rows;
    }
    const merged: ProjectedChatMessageRow[] = [];
    let next = 0;
    for (const row of rows) {
        const at = Date.parse(row.message.timestamp);
        let note = shown[next];
        while (note && Date.parse(note.message.timestamp) < at) {
            merged.push(note);
            next += 1;
            note = shown[next];
        }
        merged.push(row);
    }
    return [...merged, ...shown.slice(next)];
}

function noteRow(note: TimelineNote) {
    const actor = { id: 'haus', kind: 'participant' as const };
    return {
        actor,
        connectsToNext: false,
        connectsToPrevious: false,
        id: note.id,
        isFirstInGroup: true,
        kind: 'message',
        message: {
            actor,
            claim: null,
            content: note.text,
            id: note.id,
            metadata: withLocalTimelineMessageMetadata(),
            reply: null,
            sender: 'Haus',
            senderType: 'system',
            sourceSessionId: null,
            sourceSessionKey: 'haus:timeline-note',
            timestamp: note.timestamp,
        },
    } satisfies ProjectedChatMessageRow;
}
