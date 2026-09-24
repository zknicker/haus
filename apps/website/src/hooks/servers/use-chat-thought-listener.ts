import type { AgentThoughtEvent } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * Hears the volatile Agent thoughts announced to one Chat (prototype, ADR 0036)
 * for transient presentation. Nothing is cached or recovered: a thought missed
 * while disconnected is simply gone. The latest listener is always called.
 */
export function useChatThoughtListener(
    serverId: string,
    chatId: string | undefined,
    listener: (event: AgentThoughtEvent) => void
) {
    const latest = React.useRef(listener);
    React.useLayoutEffect(() => {
        latest.current = listener;
    });
    hausTrpc.chat.onThought.useSubscription(
        { chatId: chatId ?? '', serverId },
        {
            enabled: chatId !== undefined,
            onData: (event) => {
                if (event.serverId === serverId && event.chatId === chatId) {
                    latest.current(event);
                }
            },
        }
    );
}
