import type { ReactNode, Ref } from 'react';
import { type ChatComposerHandle, ServerChatComposer } from './chat-composer.tsx';
import { agentDmDraftKey, chatDraftKey, threadDraftKey } from './chat-draft-store.ts';
import type { ChatInlineReplyTarget } from './chat-inline-reply.tsx';

export function ChatComposer(props: {
    agentDmId?: string;
    /** See `ServerChatComposer`; a Chat or Thread view keeps the default. */
    autoFocus?: boolean;
    chatId: string;
    chatName: string;
    inlineReply?: ChatInlineReplyTarget | null;
    onInlineReplyCancel?: () => void;
    onInlineReplySent?: (messageId: string) => void;
    onSend?: () => void;
    onThreadCreated?: (threadChatId: string) => void;
    pendingChatId?: string;
    placeholder?: string;
    ref?: Ref<ChatComposerHandle>;
    serverId: string;
    status?: ReactNode;
    thread?: { anchorMessageId: string };
    variant?: 'primary' | 'secondary';
}) {
    const draftKey = props.thread
        ? threadDraftKey(props.serverId, props.chatId, props.thread.anchorMessageId)
        : props.agentDmId
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
