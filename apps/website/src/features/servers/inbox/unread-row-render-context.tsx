import type { ChatMessage } from '@haus/api';
import * as React from 'react';
import { useOpenAgentProfile } from '../../../hooks/agents/use-open-agent-profile.ts';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import type { ChatMessageLayout } from '../../../hooks/servers/chat-message-layout.ts';
import { useAttachmentDownload } from '../../../hooks/servers/use-attachment-download.ts';
import { useChatAppearances } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { useMembers } from '../../../hooks/servers/use-members.ts';
import type { TranscriptRenderContextValue } from '../../chats/chat-transcript-render-context.tsx';
import { useResolveActorProfile } from '../chat/chat-actor-profiles.ts';
import { useChatMessageEntityProjector } from '../chat/chat-message-projection.ts';
import { ServerChatMessageContent } from '../chat/server-chat-message-content.tsx';
import { useRenderMessageMedia } from '../chat/use-message-media.tsx';
import type { PendingChatMessage } from '../chat/use-pending-messages.ts';

const conversationLayout = { showAgentIdentity: true, showHumanIdentity: true } as const;
const noPendingMessages: ReadonlyMap<string, PendingChatMessage> = new Map();
const noRepliedRuns: ReadonlySet<string> = new Set();

/**
 * The transcript render context for one open Unread row: the same message
 * content, media, mentions, references, and author faces a Chat renders, so
 * the row's messages read exactly as they do in the conversation (ADR 0050).
 *
 * It differs from `useChatTranscript` only where a row is not a transcript.
 * It reads nothing per Chat — no Cloud Agent work list, no message entities —
 * because a page of rows fanning out per-Chat reads is the request burst
 * that wedges a Server; every read here is a Server-wide list the page
 * already holds. And it is read-only: no reactions, no Thread or inline-reply
 * actions, no mention requests. Answering happens in the row's own composer,
 * and anything more opens the conversation. An artifact link opens it too,
 * since the Artifact Panel belongs to the Chat (ADR 0004).
 */
export function useUnreadRowRenderContext({
    chatId,
    conversationChatId,
    messages,
    onOpenConversation,
    serverId,
}: {
    /** The Chat the messages live in: the Channel or DM, or the Thread's own Chat. */
    chatId: string;
    /** The Channel or DM a reference links to; a Thread names its parent. */
    conversationChatId: string;
    messages: readonly ChatMessage[];
    onOpenConversation: () => void;
    serverId: string;
}): TranscriptRenderContextValue {
    const agentList = useAgentAppearances(serverId);
    const download = useAttachmentDownload();
    const humans = useHumanDirectory(serverId);
    const chatsById = useChatAppearances(serverId);
    const viewerUserId = useMembers(serverId).data?.viewerUserId;
    const openAgentProfile = useOpenAgentProfile();
    const projectMessageEntity = useChatMessageEntityProjector(agentList);
    const agentsById = React.useMemo(
        () => new Map(agentList.map((agent) => [agent.id, agent])),
        [agentList]
    );
    const resolveActorProfile = useResolveActorProfile({ agentsById, humans, messages });
    // Media resolves a message's attachments by id when its row renders.
    const lookupRef = useLatestRef({
        messagesById: React.useMemo(
            () =>
                new Map<string, ChatMessageLayout>(
                    messages.map((message) => [message.id, message])
                ),
            [messages]
        ),
        pendingById: noPendingMessages,
    });
    const renderMessageAttachments = useRenderMessageMedia({ download, lookupRef, serverId });
    const openRef = useLatestRef(onOpenConversation);
    const openArtifact = React.useCallback(() => openRef.current(), [openRef]);

    return React.useMemo(
        () =>
            ({
                canRequestMention: false,
                chatId,
                conversationChatId,
                conversationLayout,
                defaultOpenWorkGroups: false,
                flashMessageId: null,
                hiddenCount: 0,
                onOpenThread: () => undefined,
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
                        onOpenArtifact={openArtifact}
                        serverId={serverId}
                    />
                ),
                repliedRunIds: noRepliedRuns,
                resolveActorProfile,
                threadActionsEnabled: false,
                turnDetails: { access: 'summary', serverId },
                viewerUserId,
            }) satisfies TranscriptRenderContextValue,
        [
            agentsById,
            chatId,
            chatsById,
            conversationChatId,
            humans,
            openAgentProfile,
            openArtifact,
            projectMessageEntity,
            renderMessageAttachments,
            resolveActorProfile,
            serverId,
            viewerUserId,
        ]
    );
}

function useLatestRef<T>(value: T) {
    const ref = React.useRef(value);
    ref.current = value;
    return ref;
}
