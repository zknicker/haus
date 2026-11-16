import type { Chat, ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import {
    MessageScroller,
    MessageScrollerButton,
    MessageScrollerContent,
    MessageScrollerItem,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from '../../../components/chats/message-scroller.tsx';
import {
    type ChatMessageLayout,
    toChatMessageLayout,
} from '../../../hooks/servers/chat-message-layout.ts';
import { useChatMessages } from '../../../hooks/servers/use-chat-messages.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { useThreadFollow } from '../../../hooks/servers/use-thread-follow.ts';
import { useThreadInlineReplies } from '../../../hooks/servers/use-thread-inline-replies.ts';
import { AutomationFireContextCard } from '../../chats/automation/automation-fire-context-card.tsx';
import {
    ChatFooterSurface,
    chatFooterClearanceClassName,
} from '../../chats/chat-footer-surface.tsx';
import { getTranscriptEntrySequences } from '../../chats/chat-read-visibility.ts';
import { TranscriptRenderProvider } from '../../chats/chat-transcript-render-context.tsx';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import { ThreadPanelHeader } from '../../chats/thread/thread-panel-header.tsx';
import type { ReferenceActivation } from '../../mentions/mention-types.ts';
import { ChatSendScroll } from '../chat/chat-send-scroll.tsx';
import { useChatTranscript } from '../chat/chat-transcript.tsx';
import { composerDropSurfaceProps } from '../chat/composer-file-drop.ts';
import { pendingThreadReplyKey, usePendingChatMessages } from '../chat/use-pending-messages.ts';
import { ClaimThreadMetadata } from '../claims/claim-thread-metadata.tsx';
import { ThreadContentComposer } from './thread-content-composer.tsx';
import { threadConversationEntries } from './thread-conversation.ts';
import { ThreadConversationHistory } from './thread-conversation-history.tsx';
import { ThreadEntryView } from './thread-entry-view.tsx';
import { ThreadReadTracker } from './thread-read-tracker.tsx';
import { threadTitles } from './thread-target.ts';
import { threadWorkClaim } from './thread-work-claim.ts';

const noReplies: readonly ChatMessageLayout[] = [];

/** Shared Thread surface for channels, Tasks, and Inbox. */
export function ThreadContent({
    active,
    anchor,
    chat,
    composerVariant = 'primary',
    pageHeader,
    headerTitle,
    initialThreadChatId,
    onClose,
    onOpenArtifact,
    onReferenceActivate,
    onReplySent,
    onViewInChannel,
    readOnly,
    summary,
    takeover,
    claimMessage,
    turnDetailsAccess,
    width,
}: {
    active: boolean;
    anchor: ChatMessage;
    chat: Chat;
    /** `secondary` when the host is a surface (the claim dialog). */
    composerVariant?: 'primary' | 'secondary';
    pageHeader?: { actions: React.ReactNode; bandHosted: boolean };
    /**
     * Overrides the derived "Thread — <chat>" title. The claim dialog names the
     * claim it opened, since that is the identity the reader came for.
     */
    headerTitle?: string;
    initialThreadChatId?: string;
    /**
     * Omitted by a host that already closes the Thread, such as a workspace
     * tab, so the header shows no second close button.
     */
    onClose?: () => void;
    onOpenArtifact: (target: HausResourceTarget) => void;
    onReferenceActivate?: ReferenceActivation;
    /** The viewer sent a reply here; a preview Thread tab pins on it. */
    onReplySent?: () => void;
    onViewInChannel: () => void;
    readOnly: boolean;
    summary: ThreadSummary | null;
    takeover: boolean;
    /** The Claim this Thread was opened on when its message sits inside the Thread. */
    claimMessage?: ChatMessage | null;
    turnDetailsAccess: 'journal' | 'summary';
    width: number | null;
}) {
    const [createdThreadChatId, setCreatedThreadChatId] = React.useState<string | null>(null);
    const viewportRef = React.useRef<HTMLDivElement>(null);
    const threadChatId =
        summary?.threadChatId ?? createdThreadChatId ?? initialThreadChatId ?? undefined;
    const messages = useChatMessages(chat.serverId, threadChatId);
    const inline = useThreadInlineReplies(chat.serverId, chat.id, anchor.id);
    const inlineMessages = inline.messages;
    const replies = messages.data?.entries ?? noReplies;
    // The anchor renders before its replies load and fits on screen, so
    // following from the start would chase the replies to the bottom.
    const followsReplies = threadChatId === undefined || messages.data !== undefined;
    const anchorLayout = React.useMemo(() => toChatMessageLayout(anchor), [anchor]);
    const follow = useThreadFollow({ chatId: chat.id, messageId: anchor.id });
    const humans = useHumanDirectory(chat.serverId);
    const viewerUserId = useMembers(chat.serverId).data?.viewerUserId;
    const titles = threadTitles(chat, anchor.id, humans);
    // A claim Thread is the claim's work surface, so its header names the claim
    // rather than the chat it hangs in — the metadata panel names the chat.
    const workClaim = threadWorkClaim(anchor, claimMessage);
    const claimThreadTitle = workClaim ? `Claim #${workClaim.claim.number}` : null;
    // Replies show as pending rows the instant they are sent, under a key the
    // anchor owns, so the very first reply — which has no Thread chat id until
    // its receipt lands — is carried the same way every later one is.
    const pendingReplies = usePendingChatMessages(pendingThreadReplyKey(anchor.id), replies);
    // The thread renders through the same Server transcript wiring as the
    // main chat, so anchor and replies look and feel like channel rows.
    const threadMessages = React.useMemo(
        () => [anchorLayout, ...replies, ...(inlineMessages ?? [])],
        [anchorLayout, inlineMessages, replies]
    );
    const { renderContext, rows } = useChatTranscript({
        // The context card above the anchor already names the automation.
        causeLineHidden: Boolean(anchor.cause),
        chatId: threadChatId ?? chat.id,
        conversationChatId: chat.id,
        messages: threadMessages,
        onOpenArtifact,
        onReferenceActivate,
        pendingMessages: pendingReplies,
        serverId: chat.serverId,
        // The header names the Claim and the metadata panel below states it.
        claimChipHiddenMessageId: workClaim?.messageId,
        turnDetailsAccess,
        viewerUserId,
    });
    const conversation = React.useMemo(
        () => threadConversationEntries(rows, inlineMessages, anchor.id),
        [anchor.id, inlineMessages, rows]
    );
    const replySequenceByEntryId = React.useMemo(
        () =>
            getTranscriptEntrySequences(
                conversation.map(({ entry }) => entry),
                replies
            ),
        [conversation, replies]
    );
    const parentRenderContext = React.useMemo<typeof renderContext>(
        () => ({
            ...renderContext,
            onOpenInlineReply: (reference, scrollToMessage) => {
                scrollToMessage?.(reference.id);
            },
            onSelectInlineReply: undefined,
            onToggleReaction: undefined,
            threadActionsEnabled: false,
        }),
        [renderContext]
    );

    return (
        <div
            className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col"
            style={width ? { width } : undefined}
            {...composerDropSurfaceProps}
        >
            <ThreadPanelHeader
                {...pageHeader}
                followed={summary?.followed ?? true}
                followPending={follow.isPending}
                header={headerTitle ?? claimThreadTitle ?? titles.header}
                onBack={onClose}
                onClose={onClose}
                onFollowChange={(next) => {
                    if (threadChatId) {
                        follow.mutate({
                            follow: next,
                            serverId: chat.serverId,
                            threadChatId,
                        });
                    }
                }}
                onViewInChannel={onViewInChannel}
                serverId={chat.serverId}
                takeover={takeover}
                target={titles.target}
                threadChatId={threadChatId}
            />
            <TranscriptRenderProvider value={renderContext}>
                <div className="max-h-[50%] shrink-0 overflow-y-auto px-5">
                    {workClaim ? (
                        <ClaimThreadMetadata
                            chat={chat}
                            chatId={chat.id}
                            fallbackClaim={workClaim.claim}
                            messageId={workClaim.messageId}
                            serverId={chat.serverId}
                        />
                    ) : null}
                </div>
            </TranscriptRenderProvider>
            <ChatFooterSurface
                footer={
                    <ThreadContentComposer
                        anchorMessageId={anchor.id}
                        chatId={chat.id}
                        chatName={titles.header}
                        claim={workClaim !== null}
                        composerVariant={composerVariant}
                        onReplySent={onReplySent}
                        onThreadCreated={setCreatedThreadChatId}
                        pendingChatId={pendingThreadReplyKey(anchor.id)}
                        readOnly={readOnly}
                        serverId={chat.serverId}
                        threadChatId={threadChatId}
                    />
                }
            >
                <TranscriptRenderProvider value={renderContext}>
                    {/* Opens on the anchor, then follows new replies like a
                    channel once the reader is at the bottom. */}
                    <MessageScrollerProvider
                        autoScroll={followsReplies}
                        defaultScrollPosition="start"
                    >
                        <MessageScroller>
                            {/* px-5 matches the main chat viewport gutter so the
                            rows' full-width hover bleed stays contained. */}
                            <MessageScrollerViewport
                                aria-label="Thread messages"
                                className={`px-5 pt-4 ${chatFooterClearanceClassName}`}
                                data-testid="thread-conversation"
                                ref={viewportRef}
                            >
                                <MessageScrollerContent className="w-full gap-0">
                                    {/*
                                     * Why the anchor was sent, above the anchor itself. A fire
                                     * writes no transcript row, so this card is where the
                                     * payload, the fire's place in the automation's history,
                                     * and the automation's own state are read.
                                     */}
                                    {anchor.cause ? (
                                        <AutomationFireContextCard
                                            messageId={anchor.id}
                                            serverId={chat.serverId}
                                        />
                                    ) : null}
                                    <ThreadConversationHistory
                                        inline={inline.history}
                                        thread={messages}
                                    />
                                    {conversation.map(({ entry, inParentChat }) => (
                                        <MessageScrollerItem
                                            className="![content-visibility:visible]"
                                            key={entry.id}
                                            messageId={entry.id}
                                        >
                                            <TranscriptRenderProvider
                                                value={
                                                    inParentChat
                                                        ? parentRenderContext
                                                        : renderContext
                                                }
                                            >
                                                <ThreadEntryView
                                                    conversationLayout={
                                                        renderContext.conversationLayout
                                                    }
                                                    entry={entry}
                                                />
                                            </TranscriptRenderProvider>
                                        </MessageScrollerItem>
                                    ))}
                                </MessageScrollerContent>
                            </MessageScrollerViewport>
                            <MessageScrollerButton
                                aria-label="Jump to latest reply"
                                className="z-10 data-[direction=end]:bottom-[calc(var(--chat-footer-height,0px)+1rem)]"
                                direction="end"
                            />
                        </MessageScroller>
                        <ThreadReadTracker
                            active={active}
                            chatId={messages.data ? threadChatId : undefined}
                            sequenceByEntryId={replySequenceByEntryId}
                            serverId={messages.data ? chat.serverId : undefined}
                            viewportRef={viewportRef}
                        />
                        <ChatSendScroll messages={pendingReplies} />
                    </MessageScrollerProvider>
                </TranscriptRenderProvider>
            </ChatFooterSurface>
        </div>
    );
}
