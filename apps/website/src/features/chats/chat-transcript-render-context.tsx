import type { ChatMessageEntity } from '@haus/api';
import * as React from 'react';

import type { TranscriptMessage } from './chat-transcript-message.tsx';
import type { ConversationMessageLayout, TranscriptActor } from './chat-transcript-model.ts';
import type { TranscriptActorProfile, TranscriptMessageRow } from './transcript-contract.ts';
import type { InlineReplyNavigation } from './transcript-reply-contract.ts';

export type { TranscriptMessageRow } from './transcript-contract.ts';

/**
 * Resolves the text a message's Copy action should place on the clipboard,
 * via the render context's optional `messageCopyText`, falling back to the
 * message's own content when the context is missing the override (or missing
 * entirely).
 */
export function getMessageCopyText(
    context: TranscriptRenderContextValue | null | undefined,
    message: TranscriptMessage
): string {
    return context?.messageCopyText?.(message) ?? message.content;
}

export interface TranscriptRenderContextValue {
    canRequestMention: boolean;
    chatId?: string;
    composerId?: string;
    conversationLayout: ConversationMessageLayout;
    currentSessionKey?: string | null;
    defaultOpenWorkGroups: boolean;
    flashMessageId: string | null;
    hiddenCount: number;
    /**
     * The text a message's Copy action writes to the clipboard. Absent by
     * default, in which case `getMessageCopyText` falls back to the raw
     * `message.content` — which is what every Message the Server stores now
     * carries (ADR 0025), so an override is only for a surface that composes
     * copyable text the Message itself does not hold.
     */
    messageCopyText?: (message: TranscriptMessage) => string;
    onActorClick?: (actor: TranscriptActor) => void;
    /** Reveals the parent excerpt's message in the current Channel/DM. */
    onOpenInlineReply?: InlineReplyNavigation;
    /** Selects a durable Channel/DM message as the next inline reply parent. */
    onSelectInlineReply?: (message: TranscriptMessage) => void;
    /**
     * Toggles the viewer's emoji reaction on a message. Absent when the
     * surface has no reaction support; all reaction UI hides with it.
     */
    onToggleReaction?: (input: { emoji: string; messageId: string; remove: boolean }) => void;
    /**
     * Agent avatars open the Agent's profile on click (ADR 0038). The surface
     * hands one stable opener down, so avatars never read the router: a
     * router read re-renders every avatar on every navigation.
     */
    openAgentProfile?: (agentId: string) => void;
    /**
     * Projects a `chat.message` entity into the row a skeleton row renders
     * (`useEntityTranscriptEntry`). Returns the same row for the same entity
     * object, so an unchanged message never re-renders its views.
     */
    projectMessageEntity?: (entity: ChatMessageEntity) => TranscriptMessageRow;
    renderMessageAttachments?: (message: TranscriptMessage) => React.ReactNode;
    /**
     * A surface-owned block that belongs to one message but is not its body —
     * the Agent-created mark today. It mounts under the message and its
     * attachments, beside the Task previews, so the transcript layer never
     * learns what any one block is, and so a block that needs Server data the
     * transcript never reads can still resolve it at the surface that does.
     */
    renderMessageContent?: (message: TranscriptMessage) => React.ReactNode;
    /** Runs whose final reply is present anywhere in the transcript. */
    repliedRunIds: ReadonlySet<string>;
    replyTargetMessageId?: string;
    resolveActorProfile?: (actor: TranscriptActor) => TranscriptActorProfile | null;
    turnDetails?: {
        access: 'journal' | 'summary';
        serverId: string;
    };
    viewerUserId?: string;
}

const TranscriptRenderContext = React.createContext<TranscriptRenderContextValue | null>(null);

export function TranscriptRenderProvider({
    children,
    value,
}: {
    children: React.ReactNode;
    value: TranscriptRenderContextValue;
}) {
    return <TranscriptRenderContext value={value}>{children}</TranscriptRenderContext>;
}

export function useTranscriptRenderContext() {
    const context = React.useContext(TranscriptRenderContext);

    if (!context) {
        throw new Error('Transcript render context is missing.');
    }

    return context;
}

// Turn content also renders outside the transcript pane (the turn drawer),
// where no render context exists and enter animation never applies.
export function useTranscriptRenderContextOptional() {
    return React.useContext(TranscriptRenderContext);
}
