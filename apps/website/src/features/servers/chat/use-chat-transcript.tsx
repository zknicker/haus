import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useOpenAgentProfile } from '../../../hooks/agents/use-open-agent-profile.ts';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import { readChatMessageEntity } from '../../../hooks/servers/chat-message-entities.ts';
import { useAttachedWorkIds } from '../../../hooks/servers/use-attached-work-ids.ts';
import { useAttachmentDownload } from '../../../hooks/servers/use-attachment-download.ts';
import { useChatMessageReaction } from '../../../hooks/servers/use-chat-message-reaction.ts';
import { useChatAppearances } from '../../../hooks/servers/use-chats.ts';
import { useChatCloudAgentWork } from '../../../hooks/servers/use-cloud-agent-work.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import type { TranscriptMessage } from '../../chats/chat-transcript-message.tsx';
import type {
    TranscriptMessageRow,
    TranscriptRenderContextValue,
} from '../../chats/chat-transcript-render-context.tsx';
import { indexCloudAgentWorkByThreadAnchor } from '../../cloud-agents/hoisted-cloud-agent-work.ts';
import { useResolveActorProfile } from './chat-actor-profiles.ts';
import {
    emptyChatMessageLayouts,
    useChatMessageEntityProjector,
    useTranscriptSkeletonRows,
} from './chat-message-projection.ts';
import type { ChatTranscriptInput } from './chat-transcript-input.ts';
import { projectPendingChatMessageRows } from './pending-messages.tsx';
import { ServerChatMessageContent } from './server-chat-message-content.tsx';
import { useRenderMessageMedia } from './use-message-media.tsx';
import type { PendingChatMessage } from './use-pending-messages.ts';

const conversationLayout = { showAgentIdentity: true, showHumanIdentity: true } as const;
const emptyPendingMessages: readonly PendingChatMessage[] = [];

/** Rows and render context retain identity across unchanged refetches to avoid rerendering every turn. */
export function useChatTranscript({
    causeLineHidden,
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
    turnDetailsAccess = 'summary',
    viewerUserId,
}: ChatTranscriptInput) {
    const queryClient = useQueryClient();
    const messageList = messages ?? emptyChatMessageLayouts;
    // Availability flips on every Agent turn; rows read it per presence dot (`useAgentPresence`),
    // so the rows' agent list changes only with the fields they render.
    const agentList = useAgentAppearances(serverId);
    const download = useAttachmentDownload();
    const humans = useHumanDirectory(serverId);
    const reaction = useChatMessageReaction();
    const toggleReaction = React.useCallback(
        (input: { emoji: string; messageId: string; remove: boolean }) => {
            if (viewerUserId) {
                reaction.mutate({ ...input, serverId });
            }
        },
        [reaction.mutate, serverId, viewerUserId]
    );
    const onToggleReaction = viewerUserId ? toggleReaction : undefined;
    // The skeleton changes only when ids, layout facts, or attached work do;
    // each row reads its own entity (`useEntityTranscriptEntry`).
    const projectedRows = useTranscriptSkeletonRows({
        attachedWork: useAttachedWorkIds(messageList),
        entries: messageList,
    });
    const projectMessageEntity = useChatMessageEntityProjector(agentList);
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
    // All work delegated inside a Thread, indexed by that Thread's anchor: the
    // transcript surface owns this read, and each row only looks its own
    // Message up. `cloud-agent-work.updated` already invalidates the list.
    const threadCloudAgentWork = useChatCloudAgentWork(serverId, conversationChatId ?? chatId);
    const hoistedCloudAgentWork = React.useMemo(
        () => indexCloudAgentWorkByThreadAnchor(threadCloudAgentWork.data),
        [threadCloudAgentWork.data]
    );
    // Reference chips read only a chat's mark; the list itself changes on every message.
    const chatsById = useChatAppearances(serverId);
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
    });
    const resolveActorProfile = useResolveActorProfile({
        agentsById,
        humans,
        messages: messageList,
    });
    const openAgentProfile = useOpenAgentProfile();
    const renderMessageAttachments = useRenderMessageMedia({ download, lookupRef, serverId });
    // A click reads the clicked message's entity from the cache: the row
    // rendered from it, so it is there.
    const readEntity = React.useCallback(
        (messageId: string) => {
            const layout = lookupRef.current.messagesById.get(messageId);
            return layout
                ? readChatMessageEntity(queryClient, layout.serverId, layout.chatId, layout.id)
                : undefined;
        },
        [lookupRef, queryClient]
    );
    const handleOpenThread = React.useCallback(
        (row: TranscriptMessageRow) => {
            const entity = readEntity(row.message.id);

            if (entity) {
                onOpenThread?.(entity.message, entity.thread);
            }
        },
        [onOpenThread, readEntity]
    );
    const handleSelectInlineReply = React.useCallback(
        (message: TranscriptMessage) => {
            const entity = readEntity(message.id);

            if (entity) {
                onSelectInlineReply?.(entity.message);
            }
        },
        [onSelectInlineReply, readEntity]
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
                openAgentProfile,
                projectMessageEntity,
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
                causeLineHidden,
                repliedRunIds: new Set<string>(),
                resolveActorProfile,
                taskChipHiddenMessageId,
                threadActionsEnabled: Boolean(onOpenThread),
                viewerUserId,
            }) satisfies TranscriptRenderContextValue,
        [
            agentsById,
            causeLineHidden,
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
            openAgentProfile,
            projectMessageEntity,
            renderMessageAttachments,
            replyTargetMessageId,
            resolveActorProfile,
            serverId,
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
