import type { ChatMessage, TaskOrigin as TaskOriginRecord } from '@haus/api';
import { Button } from '@heroui/react';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAgentAppearances } from '../../../hooks/members/use-agents.ts';
import { useChatMessage } from '../../../hooks/servers/use-chat-message.ts';
import { useListedChat } from '../../../hooks/servers/use-chats.ts';
import { useHumanDirectory } from '../../../hooks/servers/use-human-directory.ts';
import { requestMessageReveal } from '../../../hooks/servers/use-pending-message-reveal.ts';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';
import { ReferenceChip } from '../../mentions/reference-chip.tsx';
import { readReferenceMentions } from '../../mentions/reference-mentions.ts';
import { splitMentionText } from '../../mentions/render-mention-text.tsx';
import { useReferenceDirectory } from '../../mentions/use-reference-directory.ts';
import { useServerContext } from '../../servers/server-context.ts';
import { serverChatRoute } from '../../servers/server-routes.ts';

export function TaskOrigin({ origin }: { origin: TaskOriginRecord }) {
    const { server } = useServerContext();
    const navigate = useNavigate();
    const entity = useChatMessage(server.id, origin.chatId, origin.messageId);
    const channel = useListedChat(server.id, origin.chatId);
    const author = useMessageAuthorName(entity?.message ?? null);
    if (!entity) {
        return null;
    }
    const { message } = entity;
    const place = channel?.kind === 'channel' ? `#${channel.name ?? 'channel'}` : 'DM';
    const open = () => {
        requestMessageReveal(origin.chatId, { id: message.id, sequence: message.sequence });
        navigate(serverChatRoute(server.slug, origin.chatId));
    };

    return (
        <div className="flex min-w-0 pb-3">
            <Button
                aria-label={`Started from ${place}, ${author}: ${messagePreviewLine(message.content)}`}
                className="max-w-full justify-start"
                onPress={open}
                size="sm"
                variant="ghost"
            >
                <span className="shrink-0 text-muted">Started from {place}</span>
                <span className="shrink-0 font-medium">{author}</span>
                <span className="min-w-0 truncate text-muted">
                    <OriginLine message={message} />
                </span>
            </Button>
        </div>
    );
}

function OriginLine({ message }: { message: ChatMessage }) {
    const { server } = useServerContext();
    const directory = useReferenceDirectory(server.id);
    const line = message.content.split('\n').find((text) => text.trim().length > 0) ?? '';
    if (line.trimStart().startsWith('```')) {
        return messagePreviewLine(message.content);
    }
    const mentions = readReferenceMentions(line, message.taskLinks, directory);
    return splitMentionText(line, mentions).map((fragment) =>
        fragment.type === 'mention' ? (
            <ReferenceChip
                id={fragment.mention.id}
                key={`${fragment.mention.start}:${fragment.mention.end}`}
                kind={fragment.mention.kind}
                label={fragment.mention.label}
                metadata={fragment.mention.metadata}
            />
        ) : (
            <React.Fragment key={fragment.start}>{flatFragment(fragment.text)}</React.Fragment>
        )
    );
}

function flatFragment(text: string) {
    const flat = messagePreviewLine(text);
    const lead = /^\s/u.test(text) ? ' ' : '';
    const tail = /\s$/u.test(text) ? ' ' : '';
    return flat ? `${lead}${flat}${tail}` : lead || tail;
}

function useMessageAuthorName(message: ChatMessage | null): string {
    const { server } = useServerContext();
    const agents = useAgentAppearances(server.id);
    const humans = useHumanDirectory(server.id);
    if (!message) {
        return '';
    }
    const { author } = message;
    if (author.kind === 'agent') {
        return (
            agents.find((agent) => agent.id === author.agentId)?.displayName ??
            author.profile?.displayName ??
            'Agent'
        );
    }
    return humans.member(author.userId)
        ? humans.name(author.userId)
        : (author.profile?.displayName ?? humans.name(author.userId));
}
