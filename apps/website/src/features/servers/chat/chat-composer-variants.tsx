import type { ReactNode, Ref } from 'react';

import { type ChatComposerHandle, ServerChatComposer } from './chat-composer.tsx';
import { agentDmDraftKey, chatDraftKey } from './chat-draft-store.ts';
import type { ChatInlineReplyTarget } from './chat-inline-reply.tsx';

export function ChatComposer(props: {
    agentDmId?: string;
    autoFocus?: boolean;
    chatId: string;
    chatName: string;
    inlineReply?: ChatInlineReplyTarget | null;
    onInlineReplyCancel?: () => void;
    onInlineReplySent?: (messageId: string) => void;
    onSend?: () => void;
    pendingChatId?: string;
    placeholder?: string;
    ref?: Ref<ChatComposerHandle>;
    serverId: string;
    status?: ReactNode;
}) {
    const draftKey = props.agentDmId
        ? agentDmDraftKey(props.serverId, props.agentDmId)
        : chatDraftKey(props.serverId, props.chatId);

    return (
        <ServerChatComposer
            {...props}
            draftKey={draftKey}
            key={draftKey}
            target={{ chatId: props.chatId, kind: 'chat' }}
        />
    );
}

export function ImplicitAgentDmComposer({
    agentId,
    chatName,
    onMaterialized,
    serverId,
}: {
    agentId: string;
    chatName: string;
    onMaterialized: (chatId: string) => void;
    serverId: string;
}) {
    const draftKey = agentDmDraftKey(serverId, agentId);

    return (
        <ServerChatComposer
            chatName={chatName}
            draftKey={draftKey}
            key={draftKey}
            onMaterialized={onMaterialized}
            serverId={serverId}
            target={{ agentId, kind: 'agent-dm' }}
        />
    );
}
