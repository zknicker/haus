import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useChatMessage } from '../../../hooks/servers/use-chat-message.ts';
import type { ChatMessageJumpTarget } from '../../../hooks/servers/use-chat-message-navigation.ts';
import {
    requestMessageReveal,
    usePendingMessageReveal,
} from '../../../hooks/servers/use-pending-message-reveal.ts';
import { chatMessageParam } from '../server-routes.ts';

/**
 * Serves a Chat's reveals: a `?message=` link (`serverChatMessageRoute`) and
 * "View in chat" from a surface outside the Chat (`requestMessageReveal`).
 * The linked Message's entity supplies the sequence the reveal pages older
 * history by; once it resolves, the param leaves the URL and the reveal is
 * queued like any other, so it runs once the transcript shows.
 */
export function useChatRouteMessage({
    chatId,
    ready,
    revealMessage,
    serverId,
}: {
    chatId: string;
    /** The chat's transcript list has loaded. */
    ready: boolean;
    revealMessage: (target: ChatMessageJumpTarget) => void;
    serverId: string;
}) {
    const [searchParams, setSearchParams] = useSearchParams();
    const messageId = searchParams.get(chatMessageParam);
    const linked = useChatMessage(serverId, chatId, messageId ?? '', {
        enabled: messageId !== null,
    })?.message;
    const sequence = linked?.id === messageId ? linked.sequence : undefined;
    React.useEffect(() => {
        if (!(messageId && sequence !== undefined)) {
            return;
        }
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete(chatMessageParam);
                return next;
            },
            { replace: true }
        );
        requestMessageReveal(chatId, { id: messageId, sequence });
    }, [chatId, messageId, sequence, setSearchParams]);
    usePendingMessageReveal({ chatId, ready, reveal: revealMessage });
}
