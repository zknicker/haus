import type { Chat, ChatMessage, ThreadSummary } from '@haus/api';
import { Button } from '@heroui/react';
import * as React from 'react';
import {
    MessageScroller,
    MessageScrollerContent,
    MessageScrollerItem,
    MessageScrollerProvider,
    MessageScrollerViewport,
    useMessageScrollerVisibility,
} from '../../../components/chats/message-scroller.tsx';
import { useChatRead } from '../../../hooks/servers/use-chat-read.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import { useThreadFollow } from '../../../hooks/servers/use-thread-follow.ts';
import { useThreadMessages } from '../../../hooks/servers/use-thread-messages.ts';
import { AutomationFireContextCard } from '../../chats/automation/automation-fire-context-card.tsx';
import {
    getHighestVisibleSequence,
    getTranscriptEntrySequences,
} from '../../chats/chat-read-visibility.ts';
import { buildTranscriptEntries } from '../../chats/chat-transcript-model.ts';
import { TranscriptRenderProvider } from '../../chats/chat-transcript-render-context.tsx';
import { TranscriptEntryView } from '../../chats/chat-transcript-turn.tsx';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import { ThreadPanelHeader } from '../../chats/thread/thread-panel-header.tsx';
import type { ReferenceActivation } from '../../mentions/mention-types.ts';
import { ChatAgentComposition } from '../chat/agent-composition.tsx';
import { ChatComposer } from '../chat/chat-composer-variants.tsx';
import { useChatTranscript } from '../chat/chat-transcript.tsx';
import { pendingThreadReplyKey, usePendingChatMessages } from '../chat/use-pending-messages.ts';
import { TaskThreadMetadata } from '../tasks/task-thread-metadata.tsx';
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
    const replies = messages.messages;
    const replyCount = Math.max(summary?.replyCount ?? 0, replies.length);
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
    const threadMessages = React.useMemo(() => [anchor, ...replies], [anchor, replies]);
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
    const anchorEntries = React.useMemo(
        () => buildTranscriptEntries({ rows: rows.slice(0, 1) }),
        [rows]
    );
    const replyEntries = React.useMemo(
        () => buildTranscriptEntries({ rows: rows.slice(1) }),
        [rows]
    );
    const replySequenceByEntryId = React.useMemo(
        () => getTranscriptEntrySequences(replyEntries, replies),
        [replies, replyEntries]
    );

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
            <TranscriptRenderProvider
                value={{
                    ...renderContext,
                    threadAskReply: {
                        anchorMessageId: anchor.id,
                        chatId: chat.id,
                        serverId: chat.serverId,
                        answerableMessageId: readOnly
                            ? null
                            : ([...rows].reverse().find((row) => row.message.ask?.status === 'open')
                                  ?.message.id ?? null),
                    },
                }}
            >
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
                            className="px-5 py-4"
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
                                {anchorEntries.map((entry) => (
                                    <MessageScrollerItem
                                        className="![content-visibility:visible]"
                                        key={entry.id}
                                        messageId={entry.id}
                                    >
                                        <TranscriptEntryView
                                            activeReply={null}
                                            conversationLayout={renderContext.conversationLayout}
                                            entry={entry}
                                        />
                                    </MessageScrollerItem>
                                ))}
                                {replyCount === 0 ? (
                                    <div className="py-8 text-center text-muted text-sm">
                                        No replies yet
                                    </div>
                                ) : null}
                                {messages.hasOlderHistory ? (
                                    <div className="mb-5 flex justify-center">
                                        <Button
                                            isDisabled={messages.isFetchingOlderHistory}
                                            onPress={() => void messages.fetchOlderHistory()}
                                            size="sm"
                                            variant="ghost"
                                        >
                                            {messages.isFetchingOlderHistory
                                                ? 'Loading older replies…'
                                                : 'Load older replies'}
                                        </Button>
                                    </div>
                                ) : null}
                                {replyEntries.map((entry) => (
                                    <MessageScrollerItem
                                        className="![content-visibility:visible]"
                                        key={entry.id}
                                        messageId={entry.id}
                                    >
                                        <TranscriptEntryView
                                            activeReply={null}
                                            conversationLayout={renderContext.conversationLayout}
                                            entry={entry}
                                        />
                                    </MessageScrollerItem>
                                ))}
                                <ChatAgentComposition
                                    chatId={threadChatId}
                                    serverId={chat.serverId}
                                />
                            </MessageScrollerContent>
                        </MessageScrollerViewport>
                    </MessageScroller>
                </MessageScrollerProvider>
            </TranscriptRenderProvider>
            {readOnly ? (
                <p className="shrink-0 border-separator border-t px-4 py-3 text-muted text-sm">
                    This conversation is read-only because the Agent has been retired.
                </p>
            ) : (
                <ChatComposer
                    chatId={chat.id}
                    chatName={titles.header}
                    onThreadCreated={setCreatedThreadChatId}
                    pendingChatId={pendingThreadReplyKey(anchor.id)}
                    placeholder="Add a reply…"
                    serverId={chat.serverId}
                    thread={{ anchorMessageId: anchor.id }}
                    variant={composerVariant}
                />
            )}
        </div>
    );
}

function ThreadReadTracker({
    active,
    chatId,
    sequenceByEntryId,
    serverId,
}: {
    active: boolean;
    chatId: string | undefined;
    sequenceByEntryId: ReadonlyMap<string, number>;
    serverId: string | undefined;
}) {
    const visibility = useMessageScrollerVisibility();
    const visibleSequence = getHighestVisibleSequence(
        visibility.visibleMessageIds,
        sequenceByEntryId
    );

    useChatRead({
        chatId,
        enabled: active,
        sequence: visibleSequence,
        serverId,
    });

    return null;
}
