import type { Ref } from 'react';

import { ChatComposer } from '../chat/chat-composer-variants.tsx';
import type { ChatComposerHandle } from '../chat/chat-composer.tsx';

/** Where a card's reply goes, and whether it can go anywhere. */
export type UnreadRowReply =
    | { kind: 'closed' }
    | {
          /** A DM with an Agent keys its draft by the Agent, as the DM's own composer does. */
          agentDmId: null | string;
          chatId: string;
          /** What the composer's placeholder and accessible name address, as the conversation's does. */
          chatName: string;
          kind: 'chat';
          serverId: string;
      };

export function UnreadRowComposer({
    onSent,
    ref,
    reply,
}: {
    onSent: () => void;
    ref: Ref<ChatComposerHandle>;
    reply: UnreadRowReply;
}) {
    if (reply.kind === 'closed') {
        return null;
    }
    return (
        <ChatComposer
            agentDmId={reply.agentDmId ?? undefined}
            autoFocus={false}
            chatId={reply.chatId}
            chatName={reply.chatName}
            onSend={onSent}
            pendingChatId={reply.chatId}
            ref={ref}
            serverId={reply.serverId}
        />
    );
}
