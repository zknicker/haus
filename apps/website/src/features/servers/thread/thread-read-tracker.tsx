import { useMessageScrollerVisibility } from '../../../components/chats/message-scroller.tsx';
import { useChatRead } from '../../../hooks/servers/use-chat-read.ts';
import { getHighestVisibleSequence } from '../../chats/chat-read-visibility.ts';

export function ThreadReadTracker({
    active,
    chatId,
    sequenceByEntryId,
    serverId,
}: {
    active: boolean;
    chatId: string | undefined;
    sequenceByEntryId: ReadonlyMap<string, number>;
    serverId: string | undefined;
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

    return null;
}
