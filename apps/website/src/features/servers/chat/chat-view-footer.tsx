import type { Chat } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { chatCaptainId } from '../../agent-context/context-usage-model.ts';
import { ContextUsageRing } from '../../agent-context/context-usage-ring.tsx';
import { canRunAgentActions } from '../../members/agent-profile/agent-actions-model.ts';
import { ArchivedChannelBar } from './archived-channel-bar.tsx';
import { ChatComposer } from './chat-composer-variants.tsx';
import type { ChatInlineReplyTarget } from './chat-inline-reply.tsx';
import { ChatTypingIndicator } from './chat-typing-indicator.tsx';
import { ComputerUseRequests } from './computer-use-request-panel.tsx';
import { StoppedAgentDmNotice } from './stopped-agent-dm-notice.tsx';

export function ChatViewFooter({
    chat,
    chatName,
    ensureDmError,
    inlineReply,
    onInlineReplyCancel,
    onInlineReplySent,
    peerRetired,
    server,
}: {
    chat: Chat;
    chatName: string;
    ensureDmError: { message: string } | null;
    inlineReply: ChatInlineReplyTarget | null;
    onInlineReplyCancel: () => void;
    onInlineReplySent: (messageId: string) => void;
    peerRetired: boolean;
    server: ServerDetail;
}) {
    const captainId = chatCaptainId(chat);
    return (
        <>
            {ensureDmError && !peerRetired ? (
                <p className="text-danger px-9 text-sm">{ensureDmError.message}</p>
            ) : null}
            {chat.archivedAt ? (
                <ArchivedChannelBar
                    canManage={server.role === 'owner' || server.role === 'admin'}
                    chat={chat}
                />
            ) : peerRetired ? (
                <p className="text-muted mx-auto w-full max-w-none px-9 pb-4 text-sm">
                    {chatName} has been retired. You can read this conversation, but you can’t send
                    new messages.
                </p>
            ) : (
                <>
                    {chat.peerAgentId ? (
                        <StoppedAgentDmNotice
                            agentId={chat.peerAgentId}
                            canStart={canRunAgentActions(server.role)}
                            serverId={chat.serverId}
                        />
                    ) : null}
                    <ComputerUseRequests chatId={chat.id} serverId={chat.serverId} />
                    <ChatComposer
                        agentDmId={chat.peerAgentId ?? undefined}
                        chatId={chat.id}
                        chatName={chatName}
                        footer={
                            captainId ? (
                                <ContextUsageRing agentId={captainId} serverId={chat.serverId} />
                            ) : null
                        }
                        inlineReply={inlineReply}
                        onInlineReplyCancel={onInlineReplyCancel}
                        onInlineReplySent={onInlineReplySent}
                        pendingChatId={chat.id}
                        serverId={chat.serverId}
                        status={<ChatTypingIndicator chatId={chat.id} serverId={chat.serverId} />}
                    />
                </>
            )}
        </>
    );
}
