import type { Chat } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Message01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
import { useChatMessageNavigation } from '../../../hooks/servers/use-chat-message-navigation.ts';
import { useChatMessages } from '../../../hooks/servers/use-chat-messages.ts';
import { useChatRead } from '../../../hooks/servers/use-chat-read.ts';
import { useDmEnsure } from '../../../hooks/servers/use-dm-ensure.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useWindowTitle } from '../../../hooks/shell/use-window-title.ts';
import { useViewportBelow } from '../../../hooks/use-viewport-below.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { ChatDetailFrame } from '../../chats/chat-detail-frame.tsx';
import { ShellSidePane } from '../../shell/shell-side-pane.tsx';
import { PageTopbar } from '../../shell/shell-topbar.tsx';
import { ThreadPanel } from '../thread/thread-panel.tsx';
import { mergeTaskAnchor } from './chat-message-model.ts';
import { ChatTopbar } from './chat-topbar.tsx';
import { ChatTranscript } from './chat-transcript.tsx';
import { ChatViewFooter } from './chat-view-footer.tsx';
import { ChatViewSidePanel, shouldTakeOverChatSidePanel } from './chat-view-side-panel.tsx';
import { useChatArtifactPanel } from './use-artifact-panel.ts';
import { useChatFilesPane } from './use-chat-files-pane.ts';
import { useChatInlineReply } from './use-chat-inline-reply.ts';
import { useChatReferenceActivation } from './use-chat-reference-activation.ts';
import { useChatThreadPane } from './use-chat-thread-pane.ts';
import type { ChatInitialTask } from './use-chat-thread-selection.ts';
import { usePendingChatMessages } from './use-pending-messages.ts';
import { useVisibleChatSequence } from './use-visible-chat-sequence.ts';

export function ChatView({
    chat,
    initialTask,
    onOpenChat,
    server,
}: {
    chat: Chat;
    initialTask?: ChatInitialTask;
    onOpenChat: (chatId: string) => void;
    server: ServerDetail;
}) {
    const filesPane = useChatFilesPane(chat.id);
    const artifactState = useChatArtifactPanel(chat.id);
    const activeSidePane = useChatSidePane(chat.id);
    // Keep chat beside an open pane until the window is narrow enough
    // that the pane needs to take over the content area.
    const threadTakeover = useViewportBelow(1024);
    const messages = useChatMessages(chat.serverId, chat.id);
    const { clearInlineReply, clearSentInlineReply, inlineReply, selectInlineReply } =
        useChatInlineReply(chat.id);
    const { revealMessage } = useChatMessageNavigation({
        chatId: chat.id,
        fetchOlderHistory: messages.fetchOlderHistory,
        hasOlderHistory: messages.hasOlderHistory,
        messages: messages.data?.messages,
    });
    const pendingMessages = usePendingChatMessages(chat.id, messages.data?.messages);
    const sourceMessages = messages.data?.messages;
    const anchorMessage = initialTask?.message;
    // Memoized so the transcript keeps projecting against one array identity:
    // React Query's structural sharing only pays off downstream if the merge
    // above it does not hand out a fresh array on every render.
    const transcriptMessages = React.useMemo(
        () => mergeTaskAnchor(sourceMessages, anchorMessage),
        [anchorMessage, sourceMessages]
    );
    const thread = useChatThreadPane({
        chatId: chat.id,
        serverId: chat.serverId,
        initialTask,
        revealMessage,
        transcriptMessages,
    });
    const threadSelection = thread.selection;
    const visibleRead = useVisibleChatSequence(chat.id);
    const read = useChatRead({
        chatId: messages.data ? chat.id : undefined,
        enabled: !(threadSelection && threadTakeover && activeSidePane === 'thread'),
        sequence: messages.data ? visibleRead.sequence : undefined,
        serverId: messages.data ? chat.serverId : undefined,
    });
    const ensureDm = useDmEnsure(onOpenChat);
    const humans = useHumanDirectory(chat.serverId);
    const peerRetired = chat.kind === 'dm' && chat.peerAgentRetired;
    const readOnly = peerRetired || chat.archivedAt !== null;
    const chatName =
        chat.kind === 'channel'
            ? (chat.name ?? 'channel')
            : chat.peerAgentId
              ? (chat.peerAgentDisplayName ?? 'Agent')
              : `DM · ${humans.name(chat.peerUserId)}`;
    useWindowTitle(chat.kind === 'channel' ? `#${chatName}` : chatName);
    const threadSummary =
        messages.data?.threads.find(
            (summary) => summary.anchorMessageId === threadSelection?.anchor.id
        ) ??
        threadSelection?.initialSummary ??
        null;
    // The chat-scoped pane and Thread share the side panel. The latest
    // artifact opener wins and reveals the pane.
    const openArtifact = artifactState.open;
    const startDm = React.useCallback(
        (peerUserId: string) => ensureDm.mutate({ peerUserId, serverId: chat.serverId }),
        [chat.serverId, ensureDm.mutate]
    );
    const handleReferenceActivate = useChatReferenceActivation(onOpenChat);
    const threadPanel = threadSelection ? (
        <ThreadPanel
            active={activeSidePane === 'thread'}
            anchor={thread.anchor ?? threadSelection.anchor}
            chat={chat}
            initialThreadChatId={threadSelection.initialThreadChatId}
            onClose={thread.close}
            onExitComplete={thread.onExitComplete}
            onOpenArtifact={openArtifact}
            onReferenceActivate={handleReferenceActivate}
            onViewInChannel={thread.viewInChannel}
            readOnly={readOnly}
            summary={threadSummary}
            takeover={threadTakeover}
            turnDetailsAccess={server.role === 'member' ? 'summary' : 'journal'}
        />
    ) : null;
    const sidePanelTakeover = shouldTakeOverChatSidePanel({
        activePane: activeSidePane,
        artifactVisible: artifactState.visible,
        filesVisible: filesPane.visible,
        hasThread: Boolean(threadPanel),
        takeover: threadTakeover,
    });
    return (
        <section
            aria-label={chatName}
            className="relative flex min-h-0 flex-1"
            data-slot="chat-surface"
        >
            <PageTopbar>
                <ChatTopbar
                    artifactVisible={artifactState.visible}
                    chat={chat}
                    chatName={chatName}
                    onOpenFiles={filesPane.open}
                    onToggleArtifacts={artifactState.toggleVisible}
                    server={server}
                />
            </PageTopbar>
            <ShellSidePane takeover={sidePanelTakeover}>
                <ChatViewSidePanel
                    artifactState={artifactState}
                    chat={chat}
                    filesPane={filesPane}
                    messages={messages.data?.messages}
                    takeover={threadTakeover}
                    threadPanel={threadPanel}
                />
            </ShellSidePane>
            <ChatDetailFrame
                activeReplies={[]}
                chatId={chat.id}
                empty={
                    <EmptyState>
                        <EmptyState.Header>
                            <EmptyState.Media variant="icon">
                                <Icon aria-hidden="true" icon={Message01Icon} />
                            </EmptyState.Media>
                            <EmptyState.Title>No messages yet</EmptyState.Title>
                            <EmptyState.Description>
                                {chat.kind === 'channel'
                                    ? `Start the conversation in #${chatName}.`
                                    : `Send the first message to ${chatName}.`}
                            </EmptyState.Description>
                        </EmptyState.Header>
                    </EmptyState>
                }
                error={messages.error}
                fetchOlderHistory={() => {
                    void messages.fetchOlderHistory();
                }}
                footer={
                    <ChatViewFooter
                        chat={chat}
                        chatName={chatName}
                        ensureDmError={ensureDm.error}
                        inlineReply={inlineReply}
                        onInlineReplyCancel={clearInlineReply}
                        onInlineReplySent={clearSentInlineReply}
                        peerRetired={peerRetired}
                        readSequence={read.data?.sequence}
                        server={server}
                    />
                }
                hasOlderHistory={messages.hasOlderHistory}
                hasTransientTimelineContent={pendingMessages.length > 0}
                historyLoaded={Boolean(messages.data)}
                isFetchingOlderHistory={messages.isFetchingOlderHistory}
                isPending={messages.isPending}
                rowCount={transcriptMessages?.length ?? 0}
                timelineContent={(scrollContentRef) => (
                    <ChatTranscript
                        chatId={chat.id}
                        messages={transcriptMessages}
                        onOpenArtifact={openArtifact}
                        onOpenInlineReply={revealMessage}
                        onOpenThread={thread.open}
                        onReferenceActivate={handleReferenceActivate}
                        onSelectInlineReply={selectInlineReply}
                        onStartDm={startDm}
                        onVisibleSequenceChange={visibleRead.onSequenceChange}
                        pendingMessages={pendingMessages}
                        replyTargetMessageId={inlineReply?.messageId}
                        scrollContentRef={scrollContentRef}
                        serverId={chat.serverId}
                        threads={messages.data?.threads}
                        turnDetailsAccess={server.role === 'member' ? 'summary' : 'journal'}
                        viewerUserId={server.viewerUserId}
                    />
                )}
            />
        </section>
    );
}
