import type { Agent, Chat } from '@haus/api';
import * as React from 'react';
import type { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { ChatMarkdownText } from '../../chats/chat-markdown-text.tsx';
import type { TranscriptMessage } from '../../chats/chat-transcript-message.tsx';
import type { HausResourceTarget } from '../../chats/haus-resource-link.ts';
import { isLocalTimelineMessageMetadata } from '../../chats/local-timeline-message.ts';
import {
    MessageSharedArtifactScope,
    mayLinkSharedArtifact,
} from '../../chats/message-shared-artifacts.tsx';
import { MessageRoutingDebug } from '../../chats/routing/message-routing-debug.tsx';
import { cloudAgentWorkDisplayContent } from '../../cloud-agents/message-cloud-agent-work.ts';
import { ImageGenerationStrip } from '../../image-generation/image-generation-strip.tsx';
import { splitImageGenerationContent } from '../../image-generation/message-image-generations.ts';
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
    // renders as its own block below. A closing paragraph of links to the
    // Message's own linked Cloud Agent work is left out: its cards say it.
    const content = cloudAgentWorkDisplayContent(message.content, message.cloudAgentWork ?? []);
    // Generated images render where their link was written: a paragraph of
    // backed image links becomes a card (or a strip of them) in place, so the
    // raw link text is never shown beside its card.
    const segments = splitImageGenerationContent(content, message.imageGenerations ?? []);

    const Wrapper = segments.length > 1 ? SegmentColumn : React.Fragment;
    const body = (
        <>
            <Wrapper>
                {segments.map((segment) =>
                    segment.kind === 'images' ? (
                        <ImageGenerationStrip
                            generations={segment.generations}
                            key={segment.key}
                            serverId={serverId}
                        />
                    ) : (
                        <MessageTextBody
                            agentsById={agentsById}
                            chatsById={chatsById}
                            content={segment.text}
                            hausAgentId={message.hausAgentId ?? null}
                            humans={humans}
                            key={segment.key}
                            onOpenArtifact={onOpenArtifact}
                            onReferenceActivate={onReferenceActivate}
                        />
                    )
                )}
            </Wrapper>
            {message.hausAgentId || isLocalTimelineMessageMetadata(message.metadata) ? null : (
                <MessageRoutingDebug messageId={message.id} serverId={serverId} />
            )}
        </>
    );

    return mayLinkSharedArtifact(content) ? (
        <MessageSharedArtifactScope serverId={serverId}>{body}</MessageSharedArtifactScope>
    ) : (
        body
    );
}

/** Text and image cards stack one block-gap apart, like the other in-chat cards. */
function SegmentColumn({ children }: { children: React.ReactNode }) {
    return <div className="flex min-w-0 flex-col gap-(--chat-block-gap)">{children}</div>;
}

function MessageTextBody({
    agentsById,
    chatsById,
    content,
    hausAgentId,
    humans,
    onOpenArtifact,
    onReferenceActivate,
}: {
    agentsById: ReadonlyMap<string, Agent>;
    chatsById: ReadonlyMap<string, Chat>;
    content: string;
    hausAgentId: string | null;
    humans: HumanDirectory;
    onOpenArtifact: (target: HausResourceTarget) => void;
    onReferenceActivate?: ReferenceActivation;
}) {
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

    return hausAgentId ? (
        <ArtifactMessage
            agentId={hausAgentId}
            content={content}
            mentions={mentions}
            onOpenArtifact={onOpenArtifact}
            onReferenceActivate={onReferenceActivate}
        />
    ) : (
        <ChatMarkdownText
            content={content}
            mentions={mentions}
            onReferenceActivate={onReferenceActivate}
        />
    );
}
