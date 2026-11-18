import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ChatMessageJumpTarget } from '../../../hooks/servers/use-chat-message-navigation.ts';
import { useChatMessage } from '../../../hooks/servers/use-chat-message.ts';
import {
    requestMessageReveal,
    usePendingMessageReveal,
} from '../../../hooks/servers/use-pending-message-reveal.ts';
import { chatMessageParam } from '../server-routes.ts';

export function useChatRouteMessage({
    chatId,
    ready,
    revealMessage,
    serverId,
}: {
    chatId: string;
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
