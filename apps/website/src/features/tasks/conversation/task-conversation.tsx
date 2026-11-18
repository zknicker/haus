import type { TaskOrigin as TaskOriginRecord } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { Task01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useDesktopPageOpeners } from '../../../hooks/desktop-tabs/use-desktop-page-openers.ts';
import {
    type ScrollToMessage,
    useChatMessageNavigation,
} from '../../../hooks/servers/use-chat-message-navigation.ts';
import { useChatMessages } from '../../../hooks/servers/use-chat-messages.ts';
import { openDesktopArtifact } from '../../chats/artifact-panel-context.tsx';
import { ChatDetailFrame } from '../../chats/chat-detail-frame.tsx';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import type { TranscriptRenderWindowHandle } from '../../chats/use-transcript-render-window.ts';
import { getTurnDetailAccess } from '../../members/agent-profile/agent-activity-model.ts';
import { ChatComposer } from '../../servers/chat/chat-composer-variants.tsx';
import { ChatReadState } from '../../servers/chat/chat-read-state.tsx';
import { ChatTranscript } from '../../servers/chat/chat-transcript.tsx';
import { ChatTypingIndicator } from '../../servers/chat/chat-typing-indicator.tsx';
import { composerDropSurfaceProps } from '../../servers/chat/composer-file-drop.ts';
import { useChatInlineReply } from '../../servers/chat/use-chat-inline-reply.ts';
import { useChatReferenceActivation } from '../../servers/chat/use-chat-reference-activation.ts';
import { usePendingChatMessages } from '../../servers/chat/use-pending-messages.ts';
import { useVisibleChatSequenceSource } from '../../servers/chat/use-visible-chat-sequence.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';
import { TaskOrigin } from './task-origin.tsx';

/**
 * A Task's own conversation (ADR 0053 decision 2): its Chat's transcript and
 * composer, the way a Channel reads, with the "Started from" line at the top
 * once the oldest message is loaded. Posting in a done or canceled Task
 * reopens it on the Server, so the composer is always there.
 */
export function TaskConversation({
    chatId,
    origin,
    title,
}: {
    chatId: string;
    origin: TaskOriginRecord | null;
    /** What the composer addresses: the Task's key and title. */
    title: string;
}) {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const openers = useDesktopPageOpeners();
    const messages = useChatMessages(server.id, chatId);
    const { clearInlineReply, clearSentInlineReply, inlineReply, selectInlineReply } =
        useChatInlineReply(chatId);
    const transcriptRef = React.useRef<HTMLDivElement | null>(null);
    const scrollerRef = React.useRef<ScrollToMessage | null>(null);
    const renderWindowRef = React.useRef<TranscriptRenderWindowHandle | null>(null);
    const entries = messages.data?.entries;
    const { revealMessage } = useChatMessageNavigation({
        chatId,
        fetchOlderHistory: messages.fetchOlderHistory,
        hasOlderHistory: messages.hasOlderHistory,
        messages: entries,
        renderWindow: renderWindowRef,
        scroller: scrollerRef,
        transcript: transcriptRef,
    });
    const pendingMessages = usePendingChatMessages(chatId, entries);
    const visibleSequence = useVisibleChatSequenceSource();
    const openChat = (id: string) => navigate(serverChatRoute(server.slug, id));
    const activateReference = useChatReferenceActivation(openChat);
    // An artifact opens as its own page on desktop; the web has no Task side
    // pane, so it opens where the work started.
    const openArtifact = (target: HausResourceTarget) => {
        if (openers) {
            openDesktopArtifact(target, undefined, { openArtifactTab: openers.openArtifact });
        } else if (origin) {
            openChat(origin.chatId);
        }
    };
    const startedFrom = origin && !messages.hasOlderHistory ? <TaskOrigin origin={origin} /> : null;

    return (
        <section
            aria-label={title}
            className="relative flex min-h-0 min-w-0 flex-1"
            {...composerDropSurfaceProps}
        >
            <ChatDetailFrame
                activeReplies={[]}
                chatId={chatId}
                empty={<NoMessages />}
                error={messages.error}
                fetchOlderHistory={() => {
                    void messages.fetchOlderHistory();
                }}
                footer={
                    <>
                        <ChatReadState
                            chatId={messages.data ? chatId : undefined}
                            enabled
                            serverId={messages.data ? server.id : undefined}
                            visibleSequence={visibleSequence}
                        />
                        <ChatComposer
                            chatId={chatId}
                            chatName={title}
                            inlineReply={inlineReply}
                            onInlineReplyCancel={clearInlineReply}
                            onInlineReplySent={clearSentInlineReply}
                            pendingChatId={chatId}
                            serverId={server.id}
                            status={<ChatTypingIndicator chatId={chatId} serverId={server.id} />}
                        />
                    </>
                }
                hasOlderHistory={messages.hasOlderHistory}
                // The origin line is content of its own, so a Task with no
                // messages yet still opens on where it started.
                hasTransientTimelineContent={pendingMessages.length > 0 || startedFrom !== null}
                historyLoaded={Boolean(messages.data)}
                isFetchingOlderHistory={messages.isFetchingOlderHistory}
                isPending={messages.isPending}
                rowCount={entries?.length ?? 0}
                scrollerRef={scrollerRef}
                timelineContent={(scrollContentRef) => (
                    <ChatTranscript
                        chatId={chatId}
                        leadingContent={startedFrom}
                        messages={entries}
                        onOpenArtifact={openArtifact}
                        onOpenInlineReply={revealMessage}
                        onReferenceActivate={activateReference}
                        onSelectInlineReply={selectInlineReply}
                        onVisibleSequenceChange={visibleSequence.set}
                        pendingMessages={pendingMessages}
                        renderWindowRef={renderWindowRef}
                        replyTargetMessageId={inlineReply?.messageId}
                        scrollContentRef={scrollContentRef}
                        serverId={server.id}
                        turnDetailsAccess={getTurnDetailAccess(server.role)}
                        viewerUserId={server.viewerUserId}
                    />
                )}
                transcriptRef={transcriptRef}
            />
        </section>
    );
}

function NoMessages() {
    return (
        <EmptyState>
            <EmptyState.Header>
                <EmptyState.Media variant="icon">
                    <Icon aria-hidden="true" icon={Task01Icon} />
                </EmptyState.Media>
                <EmptyState.Title>No messages yet</EmptyState.Title>
            </EmptyState.Header>
        </EmptyState>
    );
}
