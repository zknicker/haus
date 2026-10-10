import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import {
    type ChatMessageEntry,
    chatMessageQueryInput,
    readChatMessageEntity,
} from './chat-message-entities.ts';
import type { ChatMessageLayout } from './chat-message-layout.ts';

const noIds: ReadonlySet<string> = new Set();

/**
 * The listed messages whose entity carries a task or a Thread. It is the one
 * mutable fact the row model groups by: such a message stands as its own
 * turn so its block stays under its own prose. Read from the entity cache
 * without observing it, and re-rendered only when an id joins or leaves the
 * set, so a reaction or a Thread reply count never reaches the transcript root.
 */
export function useAttachedWorkIds(entries: readonly ChatMessageLayout[]): ReadonlySet<string> {
    const queryClient = useQueryClient();
    const store = React.useMemo(
        () => createAttachedWorkStore(queryClient, entries),
        [entries, queryClient]
    );
    return React.useSyncExternalStore(store.subscribe, store.read, store.read);
}

function createAttachedWorkStore(queryClient: QueryClient, entries: readonly ChatMessageLayout[]) {
    const byKey = new Map(entries.map((entry) => [entityKey(entry), entry]));
    const flagged = new Set<string>();
    for (const entry of entries) {
        if (
            hasAttachedWork(
                readChatMessageEntity(queryClient, entry.serverId, entry.chatId, entry.id)
            )
        ) {
            flagged.add(entry.id);
        }
    }
    let snapshot: ReadonlySet<string> = flagged.size === 0 ? noIds : new Set(flagged);

    return {
        read: () => snapshot,
        subscribe: (notify: () => void) =>
            queryClient.getQueryCache().subscribe((event) => {
                // A collected entity keeps its last known flag; its refetch decides again.
                const input = event.type === 'removed' ? null : chatMessageQueryInput(event.query);
                const entry = input ? byKey.get(entityKey(input)) : undefined;
                const data = event.query.state.data as ChatMessageEntry | undefined;
                if (!entry || data === undefined) {
                    return;
                }
                const flag = hasAttachedWork(data);
                if (flag === flagged.has(entry.id)) {
                    return;
                }
                if (flag) {
                    flagged.add(entry.id);
                } else {
                    flagged.delete(entry.id);
                }
                snapshot = new Set(flagged);
                notify();
            }),
    };
}

function hasAttachedWork(entry: ChatMessageEntry | undefined) {
    return Boolean(entry?.message.task || entry?.thread);
}

function entityKey(target: { chatId: string; id?: string; messageId?: string; serverId: string }) {
    return `${target.serverId}\u0000${target.chatId}\u0000${target.messageId ?? target.id}`;
}
