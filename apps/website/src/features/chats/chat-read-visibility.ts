import type { ChatMessage } from '@haus/api';
import type { TranscriptEntry } from './chat-transcript-model.ts';

export function getTranscriptEntrySequences(
    entries: readonly TranscriptEntry[],
    messages: readonly Pick<ChatMessage, 'id' | 'sequence'>[]
) {
    const sequenceByMessageId = new Map(messages.map((message) => [message.id, message.sequence]));
    const sequenceByEntryId = new Map<string, number>();

    for (const entry of entries) {
        const items = entry.kind === 'turn' ? entry.items : [entry.item];
        const sequence = items.reduce<number | undefined>((highest, item) => {
            if (item.kind !== 'row' || item.row.kind !== 'message') {
                return highest;
            }

            const messageSequence = sequenceByMessageId.get(item.row.message.id);

            if (messageSequence === undefined) {
                return highest;
            }

            return highest === undefined ? messageSequence : Math.max(highest, messageSequence);
        }, undefined);

        if (sequence !== undefined) {
            sequenceByEntryId.set(entry.id, sequence);
        }
    }

    return sequenceByEntryId;
}

export function getHighestVisibleSequence(
    visibleMessageIds: readonly string[],
    sequenceByMessageId: ReadonlyMap<string, number>
) {
    return visibleMessageIds.reduce<number | undefined>((highest, messageId) => {
        const sequence = sequenceByMessageId.get(messageId);

        if (sequence === undefined) {
            return highest;
        }

        return highest === undefined ? sequence : Math.max(highest, sequence);
    }, undefined);
}
