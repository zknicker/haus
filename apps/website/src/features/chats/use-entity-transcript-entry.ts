import * as React from 'react';
import type { ChatMessageEntry } from '../../hooks/servers/chat-message-entities.ts';
import { useChatMessageEntries } from '../../hooks/servers/use-chat-message.ts';
import type { TranscriptEntry, TranscriptItem } from './chat-transcript-model.ts';
import { useTranscriptRenderContext } from './chat-transcript-render-context.tsx';
import type { TranscriptMessageRow } from './transcript-contract.ts';

type SkeletonRow = TranscriptMessageRow & { entity: NonNullable<TranscriptMessageRow['entity']> };

/**
 * Renders a transcript entry's skeleton rows from their `chat.message`
 * entities (specs/realtime-events.md, "Normalized transcript cache"). Each
 * entry observes only its own messages, so a reaction, task, Cloud Agent
 * work, or Thread summary change re-renders exactly the entry it belongs to.
 * A message whose entity is not loaded yet, or no longer resolves, renders
 * nothing; an entry with nothing left renders nothing. Rows without an entity
 * (pending sends, session history) pass through unchanged.
 */
export function useEntityTranscriptEntry<Entry extends TranscriptEntry>(
    entry: Entry | null
): Entry | null {
    const { projectMessageEntity } = useTranscriptRenderContext();
    const skeletons = React.useMemo(() => entrySkeletons(entry), [entry]);
    const targets = React.useMemo(
        () =>
            skeletons.map((row) => ({
                chatId: row.entity.chatId,
                messageId: row.id,
                serverId: row.entity.serverId,
            })),
        [skeletons]
    );
    const entities = useChatMessageEntries(targets);
    return React.useMemo(
        () =>
            entry && projectMessageEntity ? hydrate(entry, entities, projectMessageEntity) : entry,
        [entities, entry, projectMessageEntity]
    );
}

function hydrate<Entry extends TranscriptEntry>(
    entry: Entry,
    entities: readonly (ChatMessageEntry | undefined)[],
    project: (entity: NonNullable<ChatMessageEntry>) => TranscriptMessageRow
): Entry | null {
    if (entities.length === 0) {
        return entry;
    }
    let index = 0;
    const hydrateItem = (item: TranscriptItem): TranscriptItem | null => {
        if (!isSkeletonItem(item)) {
            return item;
        }
        const entity = entities[index];
        index += 1;
        return entity ? { kind: 'row', row: project(entity) } : null;
    };
    if (entry.kind === 'system') {
        const item = hydrateItem(entry.item);
        return item ? { ...entry, item } : null;
    }
    const items = entry.items.flatMap((item) => hydrateItem(item) ?? []);
    return items.length > 0 ? { ...entry, items } : null;
}

function entrySkeletons(entry: TranscriptEntry | null): SkeletonRow[] {
    if (!entry) {
        return [];
    }
    const items = entry.kind === 'system' ? [entry.item] : entry.items;
    return items.flatMap((item) => (isSkeletonItem(item) ? [item.row] : []));
}

function isSkeletonItem(item: TranscriptItem): item is { kind: 'row'; row: SkeletonRow } {
    return item.kind === 'row' && item.row.kind === 'message' && item.row.entity !== undefined;
}
