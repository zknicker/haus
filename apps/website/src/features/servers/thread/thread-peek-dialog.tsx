import type { Chat, ChatMessage, ThreadSummary } from '@haus/api';
import { Modal } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { getTurnDetailAccess } from '../../members/agent-profile/agent-activity-model.ts';
import { useChatReferenceActivation } from '../chat/use-chat-reference-activation.ts';
import { useServerContext } from '../server-context.ts';
import { serverChatRoute } from '../server-routes.ts';
import { ThreadContent } from './thread-content.tsx';

/**
 * Raft-style peek: opening a record from a list page shows its Thread work
 * surface in a dialog over that page instead of navigating into the parent
 * Chat. The Tasks page peeks a Task. "View in chat"
 * (and artifact opens, which are chat-scoped) still navigate to the Chat.
 */
export function ThreadPeekDialog({
    anchor,
    ariaLabel,
    chat,
    headerTitle,
    initialThreadChatId,
    onClose,
    summary,
}: {
    anchor: ChatMessage;
    ariaLabel: string;
    chat: Chat;
    headerTitle: string;
    initialThreadChatId: string;
    onClose: () => void;
    summary: ThreadSummary | null;
}) {
    const navigate = useNavigate();
    const { server } = useServerContext();
    const activateReference = useChatReferenceActivation((chatId) =>
        navigate(serverChatRoute(server.slug, chatId))
    );
    const openParentChat = () => {
        onClose();
        navigate(serverChatRoute(server.slug, chat.id));
    };
    const readOnly = (chat.kind === 'dm' && chat.peerAgentRetired) || chat.archivedAt !== null;

    return (
        <Modal.Backdrop
            isDismissable
            isOpen
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <Modal.Container placement="center" size="lg">
                <Modal.Dialog
                    aria-label={ariaLabel}
                    // A fixed height: the transcript scrolls inside it, so the
                    // dialog does not resize as replies load or arrive. Capped
                    // in rem so it stays proportionate on tall displays.
                    className="flex h-[min(85vh,44rem)] max-w-3xl flex-col overflow-hidden p-0"
                >
                    <ThreadContent
                        active
                        anchor={anchor}
                        chat={chat}
                        composerVariant="secondary"
                        headerTitle={headerTitle}
                        initialThreadChatId={initialThreadChatId}
                        key={anchor.id}
                        onClose={onClose}
                        onOpenArtifact={openParentChat}
                        onReferenceActivate={(reference) => {
                            onClose();
                            activateReference(reference);
                        }}
                        onViewInChannel={openParentChat}
                        readOnly={readOnly}
                        summary={summary}
                        takeover={false}
                        turnDetailsAccess={getTurnDetailAccess(server.role)}
                        width={null}
                    />
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}
