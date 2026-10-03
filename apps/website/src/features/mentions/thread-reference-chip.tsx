import type { ChatMessage, ThreadSummary } from '@haus/api';
import type * as React from 'react';
import { useChat } from '../../hooks/servers/use-chat.ts';
import { useThreadAnchorMessage } from '../../hooks/threads/use-thread-anchor-message.ts';
import { cn } from '../../lib/utils.ts';
import { messagePreviewLine } from '../chats/message-preview-line.ts';
import { ReferenceChipView } from './reference-chip-view.tsx';
import {
    ReferencePreviewHeader,
    ReferencePreviewMark,
    ReferencePreviewText,
} from './reference-preview-header.tsx';

export function ThreadReferenceChip({
    thread,
    serverId,
    ...props
}: React.ComponentProps<typeof ReferenceChipView> & {
    serverId: string;
    thread: { anchorMessageId: string; chatId: string };
}) {
    const query = useThreadAnchorMessage(serverId, thread.chatId, thread.anchorMessageId);
    const anchor = query.anchor;
    const summary =
        query.data?.threads.find((item) => item.anchorMessageId === thread.anchorMessageId) ?? null;
    const title = anchor ? threadReferenceTitle(anchor) : undefined;
    return (
        <ReferenceChipView
            {...props}
            className={cn('max-w-80', props.className)}
            displayLabel={title}
            preview={false}
            previewContent={
                props.preview ? (
                    <ThreadReferencePreview
                        chatId={thread.chatId}
                        serverId={serverId}
                        summary={summary}
                        title={title ?? 'Thread'}
                        unavailable={Boolean(query.error)}
                    />
                ) : undefined
            }
            serverId={serverId}
        />
    );
}

export function threadReferenceTitle(anchor: Pick<ChatMessage, 'body' | 'content'>) {
    const content =
        anchor.body.kind === 'cloud-agent-work' ? anchor.body.work.title : anchor.content;
    const line = messagePreviewLine(content.split('\n').find((part) => part.trim()) ?? '');
    return line.length > 64 ? `${line.slice(0, 63).trimEnd()}…` : line || 'Thread';
}

function ThreadReferencePreview({
    summary,
    title,
    serverId,
    chatId,
    unavailable,
}: {
    summary: ThreadSummary | null;
    title: string;
    serverId: string;
    chatId: string;
    unavailable: boolean;
}) {
    const chat = useChat(serverId, chatId);
    const location = chat.data?.name ? `Thread in #${chat.data.name}` : 'Thread';
    const latestReply = summary?.recentReplies.at(-1);
    const count = summary?.replyCount ?? 0;
    return (
        <ReferencePreviewHeader
            mark={<ReferencePreviewMark appearance={{ icon: 'thread' }} />}
            meta={null}
            title={title}
        >
            {unavailable ? <ReferencePreviewText>Thread unavailable</ReferencePreviewText> : null}
            {summary ? (
                <ReferencePreviewText>
                    {location} · {count} {count === 1 ? 'reply' : 'replies'}
                </ReferencePreviewText>
            ) : null}
            {latestReply ? (
                <ReferencePreviewText className="line-clamp-2" tone="foreground">
                    {messagePreviewLine(latestReply.content)}
                </ReferencePreviewText>
            ) : null}
        </ReferencePreviewHeader>
    );
}
