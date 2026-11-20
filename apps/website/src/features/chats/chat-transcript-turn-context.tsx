import type { MessageCause } from '@haus/api';
import { WorkerMessageContext } from '../workers/worker-message-context.tsx';
import { MessageCauseLine } from './automation/message-cause-line.tsx';
import type { TranscriptItem, TranscriptTurnEntry } from './chat-transcript-model.ts';
import { NavigableInlineReply, useTurnReplyReference } from './inline-reply-preview.tsx';

/**
 * What a turn answers, above its identity, as one context line. An automation
 * fire wins over a reply parent: the fire is why the Agent spoke, so a turn
 * with a cause shows only the cause line and drops its reply line.
 */
export function TurnContext({
    cause,
    entry,
}: {
    cause: MessageCause | null;
    entry: TranscriptTurnEntry;
}) {
    const reply = useTurnReplyReference(entry);

    if (cause) {
        return <MessageCauseLine cause={cause} />;
    }
    const workerBody = getTurnWorkerBody(entry.items);
    if (workerBody) {
        return <WorkerMessageContext body={workerBody} />;
    }
    return reply ? (
        <NavigableInlineReply onOpen={reply.onOpen} reference={reply.reference} />
    ) : null;
}

export function getTurnCause(items: TranscriptItem[]): MessageCause | null {
    for (const item of items) {
        if (item.kind === 'row' && item.row.kind === 'message' && item.row.message.cause) {
            return item.row.message.cause;
        }
    }

    return null;
}

export function getTurnWorkerBody(items: TranscriptItem[]) {
    const first = items.find((item) => item.kind === 'row' && item.row.kind === 'message');
    return first?.kind === 'row' && first.row.kind === 'message'
        ? (first.row.message.workerBody ?? null)
        : null;
}

export function continuesPreviousTurn(entry: TranscriptTurnEntry, cause: MessageCause | null) {
    return entry.continuesPrevious && !cause && !getTurnWorkerBody(entry.items);
}
