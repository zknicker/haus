import type { CloudAgentWork } from '@haus/api';
import * as React from 'react';
import type { TranscriptMessage } from './chat-transcript-message.tsx';
import type { ConversationMessageLayout, TranscriptActor } from './chat-transcript-model.ts';
import type { SessionMark } from './session/session-mark-model.ts';
import type {
    TranscriptActorProfile,
    TranscriptMessageRow,
    TranscriptThreadSummary,
} from './transcript-contract.ts';
import type { InlineReplyNavigation } from './transcript-reply-contract.ts';

export type { TranscriptMessageRow } from './transcript-contract.ts';

export function getTranscriptMessageThread(
    row: TranscriptMessageRow
): TranscriptThreadSummary | null {
    return 'thread' in row ? (row.thread ?? null) : null;
}

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
    /**
     * Suppresses the header's automation mark. A Thread opened on a caused
     * message states the automation, its status, and the fire in the context
     * card above the anchor, so repeating the mark on the anchor's own header
     * says the same thing twice.
     */
    causeMarkHidden?: boolean;
    chatId?: string;
    composerId?: string;
    /**
     * The Channel or DM this transcript belongs to, which for a Thread is its
     * parent. Only a conversation can be linked to; a Thread has no route of
     * its own.
     */
    conversationChatId?: string;
    conversationLayout: ConversationMessageLayout;
    currentSessionKey?: string | null;
    defaultOpenWorkGroups: boolean;
    flashMessageId: string | null;
    hiddenCount: number;
    /**
     * Cloud Agent work by Thread anchor, including completed delegations.
     */
    hoistedCloudAgentWork?: ReadonlyMap<string, readonly CloudAgentWork[]>;
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
    onOpenThread: (row: TranscriptMessageRow) => void;
    /** Selects a durable Channel/DM message as the next inline reply parent. */
    onSelectInlineReply?: (message: TranscriptMessage) => void;
    /**
     * Toggles the viewer's emoji reaction on a message. Absent when the
     * surface has no reaction support; all reaction UI hides with it.
     */
    onToggleReaction?: (input: { emoji: string; messageId: string; remove: boolean }) => void;
    onUnfollowThread: (threadChatId: string) => void;
    profilePaneChatId?: string;
    renderMessageAttachments?: (message: TranscriptMessage) => React.ReactNode;
    /**
     * A surface-owned block that belongs to one message but is not its body —
     * the Agent-created mark today. It mounts under the message and its
     * attachments, beside the thread preview, so the transcript layer never
     * learns what any one block is, and so a block that needs Server data the
     * transcript never reads can still resolve it at the surface that does.
     */
    renderMessageContent?: (message: TranscriptMessage) => React.ReactNode;
    /** Runs whose final reply is present anywhere in the transcript. */
    repliedRunIds: ReadonlySet<string>;
    replyTargetMessageId?: string;
    resolveActorProfile?: (actor: TranscriptActor) => TranscriptActorProfile | null;
    /**
     * Messages that opened a new Agent session, by message id. Derived across
     * the whole loaded transcript rather than per row, because the rule is a
     * difference between one Agent message and that Agent's previous one.
     */
    sessionMarks?: ReadonlyMap<string, SessionMark>;
    /**
     * Whether an item mounting now lands at the live edge and should animate
     * in. False for everything present at first render and for older history
     * pages loading in.
     */
    shouldAnimateItemEnter: (key: string, timestampMs: number | null) => boolean;
    /**
     * The one Message whose task chip a surrounding panel already states. A
     * Thread opened on a Task names it in the header and states its status,
     * assignee, and creator in the metadata panel above the anchor, so the
     * anchor's own chip would repeat all of it — while a reply promoted to its
     * own Task inside that Thread still wears one.
     */
    taskChipHiddenMessageId?: string;
    threadActionsEnabled: boolean;
    threadAskReply?: {
        anchorMessageId: string;
        chatId: string;
        serverId: string;
        answerableMessageId: string | null;
    };
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
