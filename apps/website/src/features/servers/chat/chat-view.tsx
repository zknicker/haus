import type { Chat, ChatMessage, ThreadSummary } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Message01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { setChatSidePane, useChatSidePane } from '../../../hooks/pane/use-chat-side-pane.ts';
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
import { useAgentLifecycle } from '../agent-lifecycle.tsx';
import { ThreadPanel } from '../thread/thread-panel.tsx';
import { ChatAgentComposition, hasAgentComposition } from './agent-composition.tsx';
import { mergeTaskAnchor } from './chat-message-model.ts';
import { ChatTopbar } from './chat-topbar.tsx';
import { ChatTranscript } from './chat-transcript.tsx';
import { ChatViewFooter } from './chat-view-footer.tsx';
import { ChatViewSidePanel, shouldTakeOverChatSidePanel } from './chat-view-side-panel.tsx';
import { useChatArtifactPanel } from './use-artifact-panel.ts';
import { useChatFilesPane } from './use-chat-files-pane.ts';
import { useChatInlineReply } from './use-chat-inline-reply.ts';
import { useChatReferenceActivation } from './use-chat-reference-activation.ts';
import { type ChatInitialTask, useChatThreadSelection } from './use-chat-thread-selection.ts';
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
    const [searchParams, setSearchParams] = useSearchParams();
    const agentLifecycles = useAgentLifecycle();
    const artifactState = useChatArtifactPanel(chat.id);
    const activeSidePane = useChatSidePane(chat.id);
    const [threadSelection, setThreadSelection] = useChatThreadSelection(chat.id, initialTask);
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
    // The selection carries identity; the record itself is read live from the
    // transcript, so a Thread left open follows its anchor's own changes — a
    // Task claimed, a Cloud Agent work that finished. The captured message is
    // the fallback for an anchor this transcript has not loaded.
    const threadAnchor = React.useMemo(
        () =>
            threadSelection
                ? (transcriptMessages?.find(
                      (message) => message.id === threadSelection.anchor.id
                  ) ?? threadSelection.anchor)
                : null,
        [threadSelection, transcriptMessages]
    );
    const threadAnchorId = searchParams.get('thread');
    const threadCloseRequestedRef = React.useRef(false);
    const restoredThreadAnchorRef = React.useRef<string | null>(null);
    React.useEffect(() => {
        if (!threadAnchorId) {
            restoredThreadAnchorRef.current = null;
            return;
        }
        if (!transcriptMessages || restoredThreadAnchorRef.current === threadAnchorId) {
            return;
        }
        const anchor = transcriptMessages.find((message) => message.id === threadAnchorId);
        if (!anchor) {
            return;
        }
        restoredThreadAnchorRef.current = threadAnchorId;
        if (threadSelection?.anchor.id === anchor.id) {
            return;
        }
        setThreadSelection({ anchor, initialSummary: null });
        setChatSidePane(chat.id, 'thread');
    }, [
        chat.id,
        setThreadSelection,
        threadAnchorId,
        threadSelection?.anchor.id,
        transcriptMessages,
    ]);
    const closeThread = React.useCallback(() => {
        threadCloseRequestedRef.current = true;
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete('thread');
                return next;
            },
            { replace: true }
        );
        setChatSidePane(chat.id, 'artifact');
    }, [chat.id, setSearchParams]);
    // The transcript's render context reaches rows through React context; fresh
    // callbacks would rebuild it and re-render the whole transcript.
    const openThread = React.useCallback(
        (anchor: ChatMessage, initialSummary: ThreadSummary | null) => {
            threadCloseRequestedRef.current = false;
            setThreadSelection({ anchor, initialSummary });
            setSearchParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    next.set('thread', anchor.id);
                    return next;
                },
                { replace: true }
            );
            setChatSidePane(chat.id, 'thread');
        },
        [chat.id, setSearchParams, setThreadSelection]
    );
    const viewThreadInChannel = () => {
        const anchor = threadSelection?.anchor;
        closeThread();
        if (anchor) {
            revealMessage({ id: anchor.id, sequence: anchor.sequence });
        }
    };
    // The chat-scoped pane and Thread share the side panel. The latest
    // artifact opener wins and reveals the pane.
    const openArtifact = artifactState.open;
    const startDm = React.useCallback(
        (peerUserId: string) => ensureDm.mutate({ peerUserId, serverId: chat.serverId }),
        [chat.serverId, ensureDm.mutate]
    );
    const handleReferenceActivate = useChatReferenceActivation(chat.id, onOpenChat);
    const threadPanel = threadSelection ? (
        <ThreadPanel
            active={activeSidePane === 'thread'}
            anchor={threadAnchor ?? threadSelection.anchor}
            chat={chat}
            initialThreadChatId={threadSelection.initialThreadChatId}
            onClose={closeThread}
            onExitComplete={() => {
                if (threadCloseRequestedRef.current) {
                    threadCloseRequestedRef.current = false;
                    setThreadSelection(null);
                }
            }}
            onOpenArtifact={openArtifact}
            onReferenceActivate={handleReferenceActivate}
            onViewInChannel={viewThreadInChannel}
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
                    server={server}
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
                hasTransientTimelineContent={
                    hasAgentComposition(chat.id, agentLifecycles) || pendingMessages.length > 0
                }
                historyLoaded={Boolean(messages.data)}
                isFetchingOlderHistory={messages.isFetchingOlderHistory}
                isPending={messages.isPending}
                rowCount={transcriptMessages?.length ?? 0}
                timelineContent={(scrollContentRef) => (
                    <ChatTranscript
                        chatId={chat.id}
                        composition={
                            <ChatAgentComposition chatId={chat.id} serverId={chat.serverId} />
                        }
                        messages={transcriptMessages}
                        onOpenArtifact={openArtifact}
                        onOpenInlineReply={revealMessage}
                        onOpenThread={openThread}
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
