import * as React from 'react';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { useAttachmentDownload } from '../../../hooks/servers/use-attachment-download.ts';
import { useChatMessageReaction } from '../../../hooks/servers/use-chat-message-reaction.ts';
import { useChats } from '../../../hooks/servers/use-chats.ts';
import { useChatCloudAgentWork } from '../../../hooks/servers/use-cloud-agent-work.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import type { TranscriptMessage } from '../../chats/chat-transcript-message.tsx';
import type {
    TranscriptMessageRow,
    TranscriptRenderContextValue,
} from '../../chats/chat-transcript-render-context.tsx';
import { deriveSessionMarks } from '../../chats/session/session-mark-model.ts';
import { indexCloudAgentWorkByThreadAnchor } from '../../cloud-agents/hoisted-cloud-agent-work.ts';
import { useResolveActorProfile } from './chat-actor-profiles.ts';
import {
    emptyChatAgents,
    emptyChatMessages,
    emptyChatThreads,
    useStableChatMessageRows,
} from './chat-message-projection.ts';
import type { ChatTranscriptInput } from './chat-transcript-input.ts';
import { MessageAttachments } from './message-attachments.tsx';
import {
    projectPendingChatMessageRows,
    renderPendingMessageAttachments,
} from './pending-messages.tsx';
import { ServerChatMessageContent } from './server-chat-message-content.tsx';
import type { PendingChatMessage } from './use-pending-messages.ts';

const conversationLayout = { showAgentIdentity: true, showHumanIdentity: true } as const;
const emptyPendingMessages: readonly PendingChatMessage[] = [];

/** Rows and render context retain identity across unchanged refetches to avoid rerendering every turn. */
export function useChatTranscript({
    causeMarkHidden,
    chatId,
    conversationChatId,
    messages,
    onOpenArtifact,
    onOpenInlineReply,
    onOpenThread,
    onReferenceActivate,
    onSelectInlineReply,
    onStartDm,
    pendingMessages = emptyPendingMessages,
    replyTargetMessageId,
    serverId,
    taskChipHiddenMessageId,
    threads = emptyChatThreads,
    turnDetailsAccess = 'summary',
    viewerUserId,
}: ChatTranscriptInput) {
    const messageList = messages ?? emptyChatMessages;
    const agents = useAgents(serverId);
    const agentList = agents.data ?? emptyChatAgents;
    const chats = useChats(serverId);
    const download = useAttachmentDownload();
    const humans = useHumanDirectory(serverId);
    const reaction = useChatMessageReaction(chatId);
    const toggleReaction = React.useCallback(
        (input: { emoji: string; messageId: string; remove: boolean }) => {
            if (viewerUserId) {
                reaction.mutate({ ...input, serverId });
            }
        },
        [reaction.mutate, serverId, viewerUserId]
    );
    const onToggleReaction = viewerUserId ? toggleReaction : undefined;
    const projectedRows = useStableChatMessageRows({
        agents: agentList,
        humans,
        messages: messageList,
        threads,
    });
    const pendingRows = React.useMemo(
        () => (viewerUserId ? projectPendingChatMessageRows(pendingMessages, viewerUserId) : []),
        [pendingMessages, viewerUserId]
    );
    const rows = React.useMemo(
        () => (pendingRows.length === 0 ? projectedRows : [...projectedRows, ...pendingRows]),
        [pendingRows, projectedRows]
    );
    const agentsById = React.useMemo(
        () => new Map(agentList.map((agent) => [agent.id, agent])),
        [agentList]
    );
    // Derived across the whole loaded page, not per row: whether a message
    // opened a new session is a difference from that Agent's previous message,
    // which no single row can see.
    const sessionMarks = React.useMemo(
        () =>
            deriveSessionMarks(
                messageList.map((message) => ({
                    agentId: message.author.kind === 'agent' ? message.author.agentId : null,
                    id: message.id,
                    sessionGeneration: message.sessionGeneration,
                }))
            ),
        [messageList]
    );
    // All work delegated inside a Thread, indexed by that Thread's anchor: the
    // transcript surface owns this read, and each row only looks its own
    // Message up. `cloud-agent-work.updated` already invalidates the list.
    const threadCloudAgentWork = useChatCloudAgentWork(serverId, conversationChatId ?? chatId);
    const hoistedCloudAgentWork = React.useMemo(
        () => indexCloudAgentWorkByThreadAnchor(threadCloudAgentWork.data),
        [threadCloudAgentWork.data]
    );
    const chatsById = React.useMemo(
        () => new Map((chats.data ?? []).map((chat) => [chat.id, chat])),
        [chats.data]
    );
    // Read through a ref: these lookups answer a click or a row's own render,
    // both of which already happen after the newest snapshot landed. Depending
    // on them directly would rebuild the render context on every refetch.
    const lookupRef = useLatestRef({
        messagesById: React.useMemo(
            () => new Map(messageList.map((message) => [message.id, message])),
            [messageList]
        ),
        pendingById: React.useMemo(
            () => new Map(pendingMessages.map((message) => [`pending:${message.nonce}`, message])),
            [pendingMessages]
        ),
        threads,
    });
    const resolveActorProfile = useResolveActorProfile({
        agentsById,
        humans,
        messages: messageList,
    });
    const downloadAttachment = download.mutate;
    const downloadPending = download.isPending;
    const renderMessageAttachments = React.useCallback(
        (message: TranscriptMessage) => {
            const sourceMessage = lookupRef.current.messagesById.get(message.id);

            const pendingMessage = lookupRef.current.pendingById.get(message.id);

            if (pendingMessage) {
                return renderPendingMessageAttachments(pendingMessage);
            }

            return sourceMessage?.attachments.length ? (
                <MessageAttachments
                    attachments={sourceMessage.attachments}
                    disabled={downloadPending}
                    onDownload={(attachment) =>
                        downloadAttachment({
                            attachmentId: attachment.id,
                            filename: attachment.filename,
                            serverId: sourceMessage.serverId,
                        })
                    }
                    serverId={sourceMessage.serverId}
                />
            ) : null;
        },
        [downloadAttachment, downloadPending, lookupRef]
    );
    const handleOpenThread = React.useCallback(
        (row: TranscriptMessageRow) => {
            const message = lookupRef.current.messagesById.get(row.message.id);

            if (!message) {
                return;
            }

            const summary =
                lookupRef.current.threads.find(
                    (candidate) => candidate.anchorMessageId === message.id
                ) ?? null;

            onOpenThread?.(message, summary);
        },
        [lookupRef, onOpenThread]
    );
    const handleSelectInlineReply = React.useCallback(
        (message: TranscriptMessage) => {
            const sourceMessage = lookupRef.current.messagesById.get(message.id);

            if (!sourceMessage) {
                return;
            }

            onSelectInlineReply?.(sourceMessage);
        },
        [lookupRef, onSelectInlineReply]
    );
    const renderContext = React.useMemo(
        () =>
            ({
                canRequestMention: true,
                chatId,
                conversationChatId: conversationChatId ?? chatId,
                conversationLayout,
                defaultOpenWorkGroups: false,
                flashMessageId: null,
                replyTargetMessageId,
                turnDetails: {
                    access: turnDetailsAccess,
                    serverId,
                },
                hiddenCount: 0,
                hoistedCloudAgentWork,
                onActorClick: onStartDm
                    ? (actor) => {
                          if (actor?.kind === 'participant') {
                              onStartDm(actor.id);
                          }
                      }
                    : undefined,
                onOpenInlineReply,
                onOpenThread: handleOpenThread,
                onSelectInlineReply: onSelectInlineReply ? handleSelectInlineReply : undefined,
                onToggleReaction,
                onUnfollowThread: () => undefined,
                profilePaneChatId: chatId,
                renderMessageAttachments,
                renderMessageContent: (message) => (
                    <ServerChatMessageContent
                        agentsById={agentsById}
                        chatsById={chatsById}
                        humans={humans}
                        message={message}
                        onOpenArtifact={onOpenArtifact}
                        onReferenceActivate={onReferenceActivate}
                        serverId={serverId}
                    />
                ),
                causeMarkHidden,
                repliedRunIds: new Set<string>(),
                resolveActorProfile,
                sessionMarks,
                taskChipHiddenMessageId,
                threadActionsEnabled: Boolean(onOpenThread),
                viewerUserId,
            }) satisfies TranscriptRenderContextValue,
        [
            agentsById,
            causeMarkHidden,
            chatId,
            chatsById,
            conversationChatId,
            handleOpenThread,
            handleSelectInlineReply,
            hoistedCloudAgentWork,
            humans,
            onOpenThread,
            onOpenInlineReply,
            onOpenArtifact,
            onReferenceActivate,
            onStartDm,
            onSelectInlineReply,
            onToggleReaction,
            renderMessageAttachments,
            replyTargetMessageId,
            resolveActorProfile,
            serverId,
            sessionMarks,
            taskChipHiddenMessageId,
            turnDetailsAccess,
            viewerUserId,
        ]
    );

    return { downloadError: download.error?.message ?? null, renderContext, rows };
}

function useLatestRef<T>(value: T) {
    const ref = React.useRef(value);

    ref.current = value;

    return ref;
}
