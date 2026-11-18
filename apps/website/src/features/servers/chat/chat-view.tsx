import type { Chat } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Message01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { useOptionalDesktopTabs } from '../../../hooks/desktop-tabs/desktop-tabs-context.ts';
import {
    type ScrollToMessage,
    useChatMessageNavigation,
} from '../../../hooks/servers/use-chat-message-navigation.ts';
import { useChatMessages } from '../../../hooks/servers/use-chat-messages.ts';
import { useDmEnsure } from '../../../hooks/servers/use-dm-ensure.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { WindowTitle } from '../../../hooks/shell/use-window-title.ts';
import { useViewportBelow } from '../../../hooks/use-viewport-below.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { ChatDetailFrame } from '../../chats/chat-detail-frame.tsx';
import type { TranscriptRenderWindowHandle } from '../../chats/use-transcript-render-window.ts';
import { PageTopbar } from '../../shell/shell-topbar.tsx';
import { ChatReadState } from './chat-read-state.tsx';
import { ChatTopbar } from './chat-topbar.tsx';
import { ChatTranscript } from './chat-transcript.tsx';
import { ChatViewFooter } from './chat-view-footer.tsx';
import { ChatViewSidePanel } from './chat-view-side-panel.tsx';
import { composerDropSurfaceProps } from './composer-file-drop.ts';
import { useChatArtifactPanel } from './use-artifact-panel.ts';
import { useChatFilesPane } from './use-chat-files-pane.ts';
import { useChatInlineReply } from './use-chat-inline-reply.ts';
import { useChatReferenceActivation } from './use-chat-reference-activation.ts';
import { useChatRouteMessage } from './use-chat-route-message.ts';
import { usePendingChatMessages } from './use-pending-messages.ts';
import { useVisibleChatSequenceSource } from './use-visible-chat-sequence.ts';

export function ChatView({
    chat,
    onOpenChat,
    server,
}: {
    chat: Chat;
    onOpenChat: (chatId: string) => void;
    server: ServerDetail;
}) {
    // chat renders no side panel there.
    const desktopTabs = useOptionalDesktopTabs() !== null;
    const filesPane = useChatFilesPane(chat.id);
    const artifactState = useChatArtifactPanel(chat.id);
    // Keep chat beside an open pane until the window is narrow enough
    // that the pane needs to take over the content area.
    const paneTakeover = useViewportBelow(1024);
    const messages = useChatMessages(chat.serverId, chat.id);
    const { clearInlineReply, clearSentInlineReply, inlineReply, selectInlineReply } =
        useChatInlineReply(chat.id);
    const transcriptRef = React.useRef<HTMLDivElement | null>(null);
    const scrollerRef = React.useRef<ScrollToMessage | null>(null);
    const renderWindowRef = React.useRef<TranscriptRenderWindowHandle | null>(null);
    const { revealMessage } = useChatMessageNavigation({
        chatId: chat.id,
        renderWindow: renderWindowRef,
        scroller: scrollerRef,
        transcript: transcriptRef,
        fetchOlderHistory: messages.fetchOlderHistory,
        hasOlderHistory: messages.hasOlderHistory,
        messages: messages.data?.entries,
    });
    const pendingMessages = usePendingChatMessages(chat.id, messages.data?.entries);
    const transcriptMessages = messages.data?.entries;
    useChatRouteMessage({
        chatId: chat.id,
        ready: transcriptMessages !== undefined,
        revealMessage,
        serverId: chat.serverId,
    });
    const visibleSequence = useVisibleChatSequenceSource();
    const ensureDm = useDmEnsure(onOpenChat);
    const humans = useHumanDirectory(chat.serverId);
    const peerRetired = chat.kind === 'dm' && chat.peerAgentRetired;
    const chatName =
        chat.kind === 'channel'
            ? (chat.name ?? 'channel')
            : chat.peerAgentId
              ? (chat.peerAgentDisplayName ?? 'Agent')
              : `DM · ${humans.name(chat.peerUserId)}`;
    const openArtifact = artifactState.open;
    const startDm = React.useCallback(
        (peerUserId: string) => ensureDm.mutate({ peerUserId, serverId: chat.serverId }),
        [chat.serverId, ensureDm.mutate]
    );
    const handleReferenceActivate = useChatReferenceActivation(onOpenChat);
    return (
        <section
            aria-label={chatName}
            className="relative flex min-h-0 flex-1"
            data-slot="chat-surface"
            {...composerDropSurfaceProps}
        >
            <WindowTitle title={chat.kind === 'channel' ? `#${chatName}` : chatName} />
            {desktopTabs ? (
                // Desktop: the tab names the chat and its context menu (and the
                // sidebar row's) carries the chat's actions, so the page leaves
                // its band empty and the band collapses.
                <h1 className="sr-only">{chatName}</h1>
            ) : (
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
            )}
            {desktopTabs ? null : (
                <ChatViewSidePanel
                    artifactState={artifactState}
                    chat={chat}
                    filesPane={filesPane}
                    messages={messages.data?.entries}
                    takeover={paneTakeover}
                />
            )}
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
                    <>
                        <ChatReadState
                            chatId={messages.data ? chat.id : undefined}
                            enabled
                            serverId={messages.data ? chat.serverId : undefined}
                            visibleSequence={visibleSequence}
                        />
                        <ChatViewFooter
                            chat={chat}
                            chatName={chatName}
                            ensureDmError={ensureDm.error}
                            inlineReply={inlineReply}
                            onInlineReplyCancel={clearInlineReply}
                            onInlineReplySent={clearSentInlineReply}
                            peerRetired={peerRetired}
                            server={server}
                        />
                    </>
                }
                hasOlderHistory={messages.hasOlderHistory}
                hasTransientTimelineContent={pendingMessages.length > 0}
                historyLoaded={Boolean(messages.data)}
                isFetchingOlderHistory={messages.isFetchingOlderHistory}
                isPending={messages.isPending}
                rowCount={transcriptMessages?.length ?? 0}
                scrollerRef={scrollerRef}
                timelineContent={(scrollContentRef) => (
                    <ChatTranscript
                        chatId={chat.id}
                        messages={transcriptMessages}
                        onOpenArtifact={openArtifact}
                        onOpenInlineReply={revealMessage}
                        onReferenceActivate={handleReferenceActivate}
                        onSelectInlineReply={selectInlineReply}
                        onStartDm={startDm}
                        onVisibleSequenceChange={visibleSequence.set}
                        pendingMessages={pendingMessages}
                        renderWindowRef={renderWindowRef}
                        replyTargetMessageId={inlineReply?.messageId}
                        scrollContentRef={scrollContentRef}
                        serverId={chat.serverId}
                        turnDetailsAccess={server.role === 'member' ? 'summary' : 'journal'}
                        viewerUserId={server.viewerUserId}
                    />
                )}
                transcriptRef={transcriptRef}
            />
        </section>
    );
}
