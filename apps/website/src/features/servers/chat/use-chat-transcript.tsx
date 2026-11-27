import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { useParams } from 'react-router-dom';
import { useOpenCaptain } from '../../../hooks/agents/use-open-captain.ts';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import { readChatMessageEntity } from '../../../hooks/servers/chat-message-entities.ts';
import { useAttachedWorkIds } from '../../../hooks/servers/use-attached-work-ids.ts';
import { useAttachmentDownload } from '../../../hooks/servers/use-attachment-download.ts';
import { useChatMessageReaction } from '../../../hooks/servers/use-chat-message-reaction.ts';
import { useChatAppearances } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import type { TranscriptMessage } from '../../chats/chat-transcript-message.tsx';
import type { TranscriptRenderContextValue } from '../../chats/chat-transcript-render-context.tsx';
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
    chatId,
    messages,
    onOpenArtifact,
    onOpenInlineReply,
    onReferenceActivate,
    onSelectInlineReply,
    onStartDm,
    pendingMessages = emptyPendingMessages,
    replyTargetMessageId,
    serverId,
    turnDetailsAccess = 'summary',
    viewerUserId,
}: ChatTranscriptInput) {
    const queryClient = useQueryClient();
    const { slug = '' } = useParams();
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
    const openAgentProfile = useOpenCaptain();
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
                conversationLayout,
                defaultOpenWorkGroups: false,
                flashMessageId: null,
                replyTargetMessageId,
                turnDetails: {
                    access: turnDetailsAccess,
                    serverId,
                },
                hiddenCount: 0,
                onActorClick: onStartDm
                    ? (actor) => {
                          if (actor?.kind === 'participant') {
                              onStartDm(actor.id);
                          }
                      }
                    : undefined,
                onOpenInlineReply,
                onSelectInlineReply: onSelectInlineReply ? handleSelectInlineReply : undefined,
                onToggleReaction,
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
                        slug={slug}
                    />
                ),
                repliedRunIds: new Set<string>(),
                resolveActorProfile,
                viewerUserId,
            }) satisfies TranscriptRenderContextValue,
        [
            agentsById,
            chatId,
            chatsById,
            handleSelectInlineReply,
            humans,
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
            slug,
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
