import type { ChatMessage } from '@haus/api';
import { buildTranscriptEntries } from '../../chats/chat-transcript-model.ts';
import type { TranscriptRow } from '../../chats/transcript-contract.ts';

/** Chat sequences are local to each source, so the focused view orders by creation time. */
export function threadConversationEntries(
    rows: readonly TranscriptRow[],
    inlineMessages: readonly Pick<ChatMessage, 'id'>[] | undefined,
    anchorMessageId: string
) {
    const parentIds = new Set(inlineMessages?.map((message) => message.id));
    const uniqueRows = [...new Map(rows.map((row) => [row.id, row])).values()];
    const entries = uniqueRows.flatMap((row) =>
        buildTranscriptEntries({ rows: [row] }).map((entry) => ({
            // One message per entry keeps actions and read receipts scoped to its source.
            entry: { ...entry, id: row.id },
            inParentChat: row.id !== anchorMessageId && parentIds.has(row.id),
        }))
    );
    return entries.sort(
        (left, right) =>
            Date.parse(left.entry.timestamp ?? '') - Date.parse(right.entry.timestamp ?? '')
    );
}
