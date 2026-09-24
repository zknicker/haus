import { ChatComposer } from '../chat/chat-composer-variants.tsx';
import { ChatTypingIndicator } from '../chat/chat-typing-indicator.tsx';

/** The dedicated Thread composer stays explicit while a Task is inspected. */
export function ThreadContentComposer({
    chatId,
    chatName,
    composerVariant,
    anchorMessageId,
    onThreadCreated,
    pendingChatId,
    readOnly,
    serverId,
    task,
    threadChatId,
}: {
    chatId: string;
    chatName: string;
    composerVariant: 'primary' | 'secondary';
    anchorMessageId: string;
    onThreadCreated: (threadChatId: string) => void;
    pendingChatId: string;
    readOnly: boolean;
    serverId: string;
    task: boolean;
    /** The Thread's own chat, which Agents engage; absent until the first reply. */
    threadChatId: string | undefined;
}) {
    if (readOnly) {
        return (
            <p className="shrink-0 border-separator border-t px-4 py-3 text-muted text-sm">
                This conversation is read-only because the Agent has been retired.
            </p>
        );
    }

    return (
        <ChatComposer
            chatId={chatId}
            chatName={chatName}
            onThreadCreated={onThreadCreated}
            pendingChatId={pendingChatId}
            placeholder={task ? 'Reply in thread…' : 'Add a reply…'}
            serverId={serverId}
            status={<ChatTypingIndicator chatId={threadChatId} serverId={serverId} />}
            thread={{ anchorMessageId }}
            variant={composerVariant}
        />
    );
}
