import type { Chat } from '@haus/api';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { ArchivedChannelBar } from './archived-channel-bar.tsx';
import { ChatComposer } from './chat-composer-variants.tsx';
import type { ChatInlineReplyTarget } from './chat-inline-reply.tsx';

export function ChatViewFooter({
    chat,
    chatName,
    ensureDmError,
    inlineReply,
    onInlineReplyCancel,
    onInlineReplySent,
    peerRetired,
    readSequence,
    server,
}: {
    chat: Chat;
    chatName: string;
    ensureDmError: { message: string } | null;
    inlineReply: ChatInlineReplyTarget | null;
    onInlineReplyCancel: () => void;
    onInlineReplySent: (messageId: string) => void;
    peerRetired: boolean;
    readSequence: number | undefined;
    server: ServerDetail;
}) {
    return (
        <>
            {ensureDmError && !peerRetired ? (
                <p className="px-9 text-danger text-sm">{ensureDmError.message}</p>
            ) : null}
            <span className="sr-only" data-testid="read-state">
                {readSequence ? `Read through ${readSequence}` : ''}
            </span>
            {chat.archivedAt ? (
                <ArchivedChannelBar
                    canManage={server.role === 'owner' || server.role === 'admin'}
                    chat={chat}
                />
            ) : peerRetired ? (
                <p className="mx-auto w-full max-w-none px-9 pb-4 text-muted text-sm">
                    {chatName} has been retired. You can read this conversation, but you can’t send
                    new messages.
                </p>
            ) : (
                <ChatComposer
                    agentDmId={chat.peerAgentId ?? undefined}
                    chatId={chat.id}
                    chatName={chatName}
                    inlineReply={inlineReply}
                    onInlineReplyCancel={onInlineReplyCancel}
                    onInlineReplySent={onInlineReplySent}
                    pendingChatId={chat.id}
                    serverId={chat.serverId}
                />
            )}
        </>
    );
}
