import type { MessageCause } from '@haus/api';
import { MessageCauseLine } from './automation/message-cause-line.tsx';
import type { TranscriptItem, TranscriptTurnEntry } from './chat-transcript-model.ts';
import { NavigableInlineReply, useTurnReplyReference } from './inline-reply-preview.tsx';
import { TurnContextLines } from './turn-context-line.tsx';

/**
 * What a turn answers, above its identity: the automation fire that woke the
 * Agent, then the message it replies to. The lower line owns the elbow.
 */
export function TurnContext({
    cause,
    entry,
}: {
    cause: MessageCause | null;
    entry: TranscriptTurnEntry;
}) {
    const reply = useTurnReplyReference(entry);

    if (!(cause || reply)) {
        return null;
    }

    return (
        <TurnContextLines>
            {cause ? <MessageCauseLine cause={cause} elbow={!reply} /> : null}
            {reply ? (
                <NavigableInlineReply onOpen={reply.onOpen} reference={reply.reference} />
            ) : null}
        </TurnContextLines>
    );
}

export function getTurnCause(items: TranscriptItem[]): MessageCause | null {
    for (const item of items) {
        if (item.kind === 'row' && item.row.kind === 'message' && item.row.message.cause) {
            return item.row.message.cause;
        }
    }

    return null;
}
