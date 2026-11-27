import type { TaskDeliveryMode } from '@haus/api';
import * as React from 'react';
import { TaskDeliverySelect } from '../../tasks/conversation/task-delivery-select.tsx';
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
    ref?: React.Ref<ChatComposerHandle>;
    serverId: string;
    status?: React.ReactNode;
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

/** A Task chat's composer: steer by default, interrupt or queue for one send. */
export function TaskComposer(props: {
    chatId: string;
    chatName: string;
    inlineReply?: ChatInlineReplyTarget | null;
    onInlineReplyCancel?: () => void;
    onInlineReplySent?: (messageId: string) => void;
    serverId: string;
    status?: React.ReactNode;
}) {
    const [delivery, setDelivery] = React.useState<TaskDeliveryMode>('steer');
    const draftKey = chatDraftKey(props.serverId, props.chatId);

    return (
        <ServerChatComposer
            {...props}
            draftKey={draftKey}
            key={draftKey}
            onSend={() => setDelivery('steer')}
            pendingChatId={props.chatId}
            target={{ chatId: props.chatId, delivery, kind: 'chat' }}
            toolbarEnd={<TaskDeliverySelect mode={delivery} onChange={setDelivery} />}
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
