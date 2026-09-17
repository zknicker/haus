import type { Agent, Chat } from '@haus/api';
import type { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { ChatMarkdownText } from '../../chats/chat-markdown-text.tsx';
import type { TranscriptMessage } from '../../chats/chat-transcript-message.tsx';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import { isLocalTimelineMessageMetadata } from '../../chats/local-timeline-message.ts';
import { MessageRoutingDebug } from '../../chats/routing/message-routing-debug.tsx';
import {
    applyAgentMentionAppearance,
    applyChatMentionAppearance,
    applyHumanMentionAppearance,
    readMentionsFromMarkdown,
} from '../../mentions/mention-metadata.ts';
import type { ReferenceActivation } from '../../mentions/mention-types.ts';
import { ArtifactMessage } from './artifact-message.tsx';

type HumanDirectory = ReturnType<typeof useHumanDirectory>;

export function ServerChatMessageContent({
    agentsById,
    chatsById,
    humans,
    message,
    onOpenArtifact,
    onReferenceActivate,
    serverId,
}: {
    agentsById: ReadonlyMap<string, Agent>;
    chatsById: ReadonlyMap<string, Chat>;
    humans: HumanDirectory;
    message: TranscriptMessage;
    serverId: string;
    onOpenArtifact: (target: HausResourceTarget) => void;
    onReferenceActivate?: ReferenceActivation;
}) {
    // Every Message the Server stores carries its own authored content (ADR
    // 0025), including the ones that also carry a typed body — so this row
    // renders that content and nothing else, and whatever the body projects
    // renders as its own block below.
    const content = message.content;

    const mentions = applyHumanMentionAppearance(
        applyChatMentionAppearance(
            applyAgentMentionAppearance(readMentionsFromMarkdown(content), (agentId) => {
                const agent = agentId ? agentsById.get(agentId) : undefined;
                return {
                    avatarUrl: agent?.avatarUrl ?? null,
                    displayName: agent?.displayName ?? null,
                    primaryColor: null,
                };
            }),
            (chatId) => {
                const chat = chatId ? chatsById.get(chatId) : undefined;
                return { color: chat?.color ?? null, icon: chat?.icon ?? null };
            }
        ),
        (userId) => ({
            avatarUrl: humans.avatarUrl(userId ?? null),
            displayName: humans.member(userId ?? null) ? humans.name(userId ?? null) : null,
        })
    );

    return message.hausAgentId ? (
        <ArtifactMessage
            agentId={message.hausAgentId}
            content={content}
            mentions={mentions}
            onOpenArtifact={onOpenArtifact}
            onReferenceActivate={onReferenceActivate}
        />
    ) : (
        <>
            <ChatMarkdownText
                content={content}
                mentions={mentions}
                onReferenceActivate={onReferenceActivate}
            />
            {isLocalTimelineMessageMetadata(message.metadata) ? null : (
                <MessageRoutingDebug messageId={message.id} serverId={serverId} />
            )}
        </>
    );
}
