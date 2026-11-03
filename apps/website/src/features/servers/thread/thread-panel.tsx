import type { Chat, ChatMessage, ThreadSummary } from '@haus/api';
import { ChatSidePaneShell } from '../../chats/chat-side-pane-shell.tsx';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import type { ReferenceActivation } from '../../mentions/mention-types.ts';
import { ThreadContent } from './thread-content.tsx';

export function ThreadPanel({
    active,
    anchor,
    chat,
    initialThreadChatId,
    onClose,
    onExitComplete,
    onOpenArtifact,
    onReferenceActivate,
    onViewInChannel,
    readOnly,
    summary,
    takeover,
    taskMessage,
    turnDetailsAccess,
}: {
    active: boolean;
    anchor: ChatMessage;
    chat: Chat;
    initialThreadChatId?: string;
    onClose: () => void;
    onExitComplete: () => void;
    onOpenArtifact: (target: HausResourceTarget) => void;
    onReferenceActivate?: ReferenceActivation;
    onViewInChannel: () => void;
    readOnly: boolean;
    summary: ThreadSummary | null;
    takeover: boolean;
    /** The Task the Thread was opened on when its message sits inside the Thread. */
    taskMessage?: ChatMessage | null;
    turnDetailsAccess: 'journal' | 'summary';
}) {
    return (
        <ChatSidePaneShell
            keepMounted
            label="Thread"
            onExitComplete={onExitComplete}
            open={active}
            takeover={takeover}
        >
            {(width) => (
                <ThreadContent
                    active={active}
                    anchor={anchor}
                    chat={chat}
                    initialThreadChatId={initialThreadChatId}
                    key={anchor.id}
                    onClose={onClose}
                    onOpenArtifact={onOpenArtifact}
                    onReferenceActivate={onReferenceActivate}
                    onViewInChannel={onViewInChannel}
                    readOnly={readOnly}
                    summary={summary}
                    takeover={takeover}
                    taskMessage={taskMessage}
                    turnDetailsAccess={turnDetailsAccess}
                    width={width}
                />
            )}
        </ChatSidePaneShell>
    );
}
