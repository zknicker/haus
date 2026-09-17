import type { ChatMessage, ThreadSummary } from '@haus/api';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import type { InlineReplyNavigation } from '../../chats/transcript-reply-contract.ts';
import type { ReferenceActivation } from '../../mentions/mention-types.ts';
import type { PendingChatMessage } from './use-pending-messages.ts';

export interface ChatTranscriptInput {
    /** Hides the header automation mark when a context card already states it. */
    causeMarkHidden?: boolean;
    chatId: string;
    /** The Channel or DM this transcript belongs to; a Thread names its parent. */
    conversationChatId?: string;
    messages: readonly ChatMessage[] | undefined;
    onOpenArtifact: (target: HausResourceTarget) => void;
    onOpenInlineReply?: InlineReplyNavigation;
    onOpenThread?: (message: ChatMessage, summary: ThreadSummary | null) => void;
    onReferenceActivate?: ReferenceActivation;
    onSelectInlineReply?: (message: ChatMessage) => void;
    onStartDm?: (userId: string) => void;
    pendingMessages?: readonly PendingChatMessage[];
    replyTargetMessageId?: string;
    serverId: string;
    /** Hides one Message's task chip when a metadata panel already states it. */
    taskChipHiddenMessageId?: string;
    threads?: readonly ThreadSummary[];
    turnDetailsAccess?: 'journal' | 'summary';
    viewerUserId?: string;
}
