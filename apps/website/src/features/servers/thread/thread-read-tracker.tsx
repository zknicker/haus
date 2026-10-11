import type * as React from 'react';
import { useMessageScrollerVisibility } from '../../../components/chats/message-scroller.tsx';
import { useChatRead } from '../../../hooks/servers/use-chat-read.ts';
import { getHighestVisibleSequence } from '../../chats/chat-read-visibility.ts';
import { ThreadUnreadLanding } from './thread-unread-landing.tsx';

/**
 * The Thread's read position: it opens at the first unread reply
 * (`ThreadUnreadLanding`), and the replies in view are read while the Thread
 * is active. `chatId` and `serverId` arrive once the replies have loaded.
 * Render it after the Thread's `MessageScroller`, so its rows exist when it lands.
 */
export function ThreadReadTracker({
    active,
    chatId,
    sequenceByEntryId,
    serverId,
    viewportRef,
}: {
    active: boolean;
    chatId: string | undefined;
    sequenceByEntryId: ReadonlyMap<string, number>;
    serverId: string | undefined;
    /** The Thread's scroll viewport, where `ThreadUnreadLanding` measures and lands. */
    viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
    const visibility = useMessageScrollerVisibility();
    const visibleSequence = getHighestVisibleSequence(
        visibility.visibleMessageIds,
        sequenceByEntryId
    );

    useChatRead({
        chatId,
        enabled: active,
        sequence: visibleSequence,
        serverId,
    });

    return serverId ? (
        <ThreadUnreadLanding
            sequenceByEntryId={sequenceByEntryId}
            serverId={serverId}
            threadChatId={chatId}
            viewportRef={viewportRef}
        />
    ) : null;
}
