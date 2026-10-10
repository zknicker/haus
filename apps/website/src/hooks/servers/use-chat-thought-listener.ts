import type { AgentThoughtEvent } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { useChatLost } from '../realtime/use-chat-lost.ts';
import { useSubscriptionRestart } from '../realtime/use-subscription-restart.ts';

/**
 * Hears the volatile Agent thoughts announced to one Chat (ADR 0036)
 * for transient presentation. Nothing is cached or recovered: a thought missed
 * while disconnected is simply gone. The latest listener is always called.
 */
export function useChatThoughtListener(
    serverId: string,
    ownChatId: string | undefined,
    listener: (event: AgentThoughtEvent) => void
) {
    // A deleted Chat stops its stream; it never retries against a missing Chat.
    const chatId = useChatLost(serverId, ownChatId) ? undefined : ownChatId;
    const latest = React.useRef(listener);
    React.useLayoutEffect(() => {
        latest.current = listener;
    });
    const restart = useSubscriptionRestart(
        'chat.onThought',
        serverId,
        undefined,
        `${serverId}:${chatId ?? ''}`
    );
    const { reset } = hausTrpc.chat.onThought.useSubscription(
        { chatId: chatId ?? '', serverId },
        {
            enabled: chatId !== undefined && restart.open,
            onComplete: () => restart.completed(reset),
            onError: (error) => restart.failed(error, reset),
            onStarted: restart.started,
            onData: (event) => {
                if (event.serverId === serverId && event.chatId === chatId) {
                    latest.current(event);
                }
            },
        }
    );
}
