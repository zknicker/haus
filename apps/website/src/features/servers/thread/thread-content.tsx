import type { Chat, ChatMessage, ThreadSummary } from '@haus/api';
import * as React from 'react';
import {
    MessageScroller,
    MessageScrollerContent,
    MessageScrollerItem,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from '../../../components/chats/message-scroller.tsx';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { useThreadFollow } from '../../../hooks/servers/use-thread-follow.ts';
import { useThreadInlineReplies } from '../../../hooks/servers/use-thread-inline-replies.ts';
import { useThreadMessages } from '../../../hooks/servers/use-thread-messages.ts';
import { AutomationFireContextCard } from '../../chats/automation/automation-fire-context-card.tsx';
import { getTranscriptEntrySequences } from '../../chats/chat-read-visibility.ts';
import { TranscriptRenderProvider } from '../../chats/chat-transcript-render-context.tsx';
import { TranscriptEntryView } from '../../chats/chat-transcript-turn.tsx';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import { ThreadPanelHeader } from '../../chats/thread/thread-panel-header.tsx';
import type { ReferenceActivation } from '../../mentions/mention-types.ts';
import { useChatTranscript } from '../chat/chat-transcript.tsx';
import { pendingThreadReplyKey, usePendingChatMessages } from '../chat/use-pending-messages.ts';
import { TaskThreadMetadata } from '../tasks/task-thread-metadata.tsx';
import { ThreadContentComposer } from './thread-content-composer.tsx';
import { threadConversationEntries } from './thread-conversation.ts';
import { ThreadConversationHistory } from './thread-conversation-history.tsx';
import { ThreadReadTracker } from './thread-read-tracker.tsx';
import { threadTitles } from './thread-target.ts';

/** Shared Thread surface for channels, Tasks, and Inbox. */
export function ThreadContent({
    active,
    anchor,
    chat,
    composerVariant = 'primary',
    headerTitle,
    initialThreadChatId,
    onClose,
    onOpenArtifact,
    onReferenceActivate,
    onViewInChannel,
    readOnly,
    summary,
    takeover,
    turnDetailsAccess,
    width,
}: {
    active: boolean;
    anchor: ChatMessage;
    chat: Chat;
    /** `secondary` when the host is a surface (the task dialog). */
    composerVariant?: 'primary' | 'secondary';
    /**
     * Overrides the derived "Thread — <chat>" title. The task dialog names the
     * task it opened, since that is the identity the reader came for.
     */
    headerTitle?: string;
    initialThreadChatId?: string;
    onClose: () => void;
    onOpenArtifact: (target: HausResourceTarget) => void;
    onReferenceActivate?: ReferenceActivation;
    onViewInChannel: () => void;
    readOnly: boolean;
    summary: ThreadSummary | null;
    takeover: boolean;
    turnDetailsAccess: 'journal' | 'summary';
    width: number | null;
}) {
    const [createdThreadChatId, setCreatedThreadChatId] = React.useState<string | null>(null);
    const threadChatId =
        summary?.threadChatId ?? createdThreadChatId ?? initialThreadChatId ?? undefined;
    const messages = useThreadMessages(chat.serverId, threadChatId);
    const inline = useThreadInlineReplies(chat.serverId, chat.id, anchor.id);
    const inlineMessages = inline.messages;
    const replies = messages.messages;
    const follow = useThreadFollow(chat.id);
    const humans = useHumanDirectory(chat.serverId);
    const viewerUserId = useMembers(chat.serverId).data?.viewerUserId;
    const titles = threadTitles(chat, anchor.id, humans);
    // A task Thread is the task's work surface, so its header names the task
    // rather than the chat it hangs in — the metadata panel names the chat.
    const taskThreadTitle = anchor.task ? `Task #${anchor.task.number}` : null;
    // Replies show as pending rows the instant they are sent, under a key the
    // anchor owns, so the very first reply — which has no Thread chat id until
    // its receipt lands — is carried the same way every later one is.
    const pendingReplies = usePendingChatMessages(pendingThreadReplyKey(anchor.id), replies);
    // The thread renders through the same Server transcript wiring as the
    // main chat, so anchor and replies look and feel like channel rows.
    const threadMessages = React.useMemo(
        () => [anchor, ...replies, ...(inlineMessages ?? [])],
        [anchor, inlineMessages, replies]
    );
    const { renderContext, rows } = useChatTranscript({
        // The context card above the anchor already names the automation.
        causeMarkHidden: Boolean(anchor.cause),
        chatId: threadChatId ?? chat.id,
        conversationChatId: chat.id,
        messages: threadMessages,
        onOpenArtifact,
        onReferenceActivate,
        pendingMessages: pendingReplies,
        serverId: chat.serverId,
        // The header names the Task and the metadata panel below states it.
        taskChipHiddenMessageId: anchor.task ? anchor.id : undefined,
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

    const threadRenderContext = {
        ...renderContext,
        threadAskReply: {
            anchorMessageId: anchor.id,
            chatId: chat.id,
            serverId: chat.serverId,
            answerableMessageId: readOnly
                ? null
                : ([anchor, ...replies]
                      .reverse()
                      .find(
                          (message) =>
                              message.body.kind === 'ask' && message.body.ask.status === 'open'
                      )?.id ?? null),
        },
    };

    return (
        <div
            className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
            style={width ? { width } : undefined}
        >
            <ThreadPanelHeader
                followed={summary?.followed ?? true}
                followPending={follow.isPending}
                header={headerTitle ?? taskThreadTitle ?? titles.header}
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
                takeover={takeover}
                target={titles.target}
                threadExists={threadChatId !== undefined}
            />
            <TranscriptRenderProvider value={threadRenderContext}>
                <div className="max-h-[50%] shrink-0 overflow-y-auto px-5">
                    {anchor.task ? (
                        <TaskThreadMetadata
                            chat={chat}
                            chatId={chat.id}
                            fallbackTask={anchor.task}
                            messageId={anchor.id}
                        />
                    ) : null}
                </div>
                <MessageScrollerProvider autoScroll={false} defaultScrollPosition="start">
                    <ThreadReadTracker
                        active={active}
                        chatId={messages.data ? threadChatId : undefined}
                        sequenceByEntryId={replySequenceByEntryId}
                        serverId={messages.data ? chat.serverId : undefined}
                    />
                    <MessageScroller>
                        {/* px-5 matches the main chat viewport gutter so the
                            rows' full-width hover bleed stays contained. */}
                        <MessageScrollerViewport
                            aria-label="Thread messages"
                            className="thread-conversation-viewport px-5 py-4"
                            data-testid="thread-conversation"
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
                                                    : threadRenderContext
                                            }
                                        >
                                            <TranscriptEntryView
                                                activeReply={null}
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
                    </MessageScroller>
                </MessageScrollerProvider>
            </TranscriptRenderProvider>
            <ThreadContentComposer
                anchorMessageId={anchor.id}
                chatId={chat.id}
                chatName={titles.header}
                composerVariant={composerVariant}
                onThreadCreated={setCreatedThreadChatId}
                pendingChatId={pendingThreadReplyKey(anchor.id)}
                readOnly={readOnly}
                serverId={chat.serverId}
                task={Boolean(anchor.task)}
            />
        </div>
    );
}
