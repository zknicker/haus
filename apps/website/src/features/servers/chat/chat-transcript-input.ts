import type { ChatMessage } from '@haus/api';
import type { ChatMessageLayout } from '../../../hooks/servers/chat-message-layout.ts';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import type { InlineReplyNavigation } from '../../chats/transcript-reply-contract.ts';
import type { ReferenceActivation } from '../../mentions/mention-types.ts';
import type { PendingChatMessage } from './use-pending-messages.ts';

export interface ChatTranscriptInput {
    chatId: string;
    /**
     * The transcript's listed messages as ids and layout facts, oldest first;
     * each row reads its own `chat.message` entity.
     */
    messages: readonly ChatMessageLayout[] | undefined;
    onOpenArtifact: (target: HausResourceTarget) => void;
    onOpenInlineReply?: InlineReplyNavigation;
    onReferenceActivate?: ReferenceActivation;
    onSelectInlineReply?: (message: ChatMessage) => void;
    onStartDm?: (userId: string) => void;
    pendingMessages?: readonly PendingChatMessage[];
    replyTargetMessageId?: string;
    serverId: string;
    turnDetailsAccess?: 'journal' | 'summary';
    viewerUserId?: string;
}
