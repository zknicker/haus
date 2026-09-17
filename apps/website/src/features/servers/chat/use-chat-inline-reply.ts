import type { ChatMessage } from '@haus/api';
import * as React from 'react';
import { type ChatInlineReplyTarget, toChatInlineReplyTarget } from './chat-inline-reply.tsx';

export function useChatInlineReply(chatId: string) {
    const [inlineReply, setInlineReply] = React.useState<ChatInlineReplyTarget | null>(null);
    const selectInlineReply = React.useCallback(
        (message: ChatMessage) => {
            if (message.chatId === chatId) {
                setInlineReply(toChatInlineReplyTarget(message));
            }
        },
        [chatId]
    );
    const clearInlineReply = React.useCallback(() => setInlineReply(null), []);
    const clearSentInlineReply = React.useCallback((messageId: string) => {
        setInlineReply((current) => (current?.messageId === messageId ? null : current));
    }, []);

    return { clearInlineReply, clearSentInlineReply, inlineReply, selectInlineReply };
}
