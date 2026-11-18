import { isActivityBackedMessageRow, isStreamingPostMessageRow } from '../chat-transcript-model.ts';
import { isLocalTimelineMessageMetadata } from '../local-timeline-message.ts';
import type { TranscriptMessageRow } from '../transcript-contract.ts';

/** Only Server-persisted, settled chat messages can anchor durable actions (reply, react). */
export function isDurableMessageRow(row: TranscriptMessageRow) {
    return (
        row.message.id.startsWith('msg_') &&
        !isActivityBackedMessageRow(row) &&
        !isLocalTimelineMessageMetadata(row.message.metadata) &&
        !isStreamingPostMessageRow(row)
    );
}
