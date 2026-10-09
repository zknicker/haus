import { Alert } from '@heroui/react';
import { FileTextIcon } from 'lucide-react';
import * as React from 'react';
import {
    Attachment,
    AttachmentContent,
    AttachmentDescription,
    AttachmentDownloadLink,
    AttachmentMedia,
    AttachmentTitle,
} from '../../components/chats/attachment.tsx';
import { cn } from '../../lib/utils.ts';
import {
    applyAgentMentionAppearance,
    readMentionsFromMarkdown,
} from '../mentions/mention-metadata.ts';
import { CollapsibleText } from '../rows/collapsible-text.tsx';
import { getMessageDisplay } from '../rows/message-display.ts';
import type { ChatTextAnimationRange } from './chat-inline-text-animation.tsx';
import { ChatMarkdownText } from './chat-markdown-text.tsx';
import { ChatMessageImage } from './chat-message-image.tsx';
import type { TranscriptMessage } from './transcript-contract.ts';

export type { TranscriptMessage } from './transcript-contract.ts';

type MessageAttachment = NonNullable<TranscriptMessage['attachments']>[number];

export function ChatTranscriptMessageContent({
    animatedRanges,
    contentOverride,
    message,
    textClassName,
}: {
    animatedRanges?: readonly ChatTextAnimationRange[];
    contentOverride?: string;
    message: TranscriptMessage;
    textClassName?: string;
}) {
    const messageDisplay = getMessageDisplay(message);
    const isErrorEvent =
        message.senderType === 'agent' &&
        messageDisplay.content.length === 0 &&
        message.metadata?.stopReason === 'error';
    const content = contentOverride ?? messageDisplay.content;
    const mentions = React.useMemo(
        () =>
            applyAgentMentionAppearance(readMentionsFromMarkdown(content), () => ({
                avatarUrl: null,
                displayName: null,
                primaryColor: null,
            })),
        [content]
    );

    if (isErrorEvent) {
        return (
            <Alert status="danger">
                <Alert.Content>
                    <Alert.Title>Error - session ended unexpectedly</Alert.Title>
                </Alert.Content>
            </Alert>
        );
    }

    if (!messageDisplay.showBodyContent) {
        return null;
    }

    // Type scale comes from the surrounding ChatMessage.Content slot; this
    // wrapper only sets color so live and durable replies share geometry.
    return (
        <CollapsibleText className={cn(textClassName ?? 'text-foreground')}>
            <ChatMarkdownText
                animatedRanges={animatedRanges}
                content={content}
                mentions={mentions}
            />
        </CollapsibleText>
    );
}

export function getTranscriptMessageContent(message: TranscriptMessage) {
    const messageDisplay = getMessageDisplay(message);

    return messageDisplay.showBodyContent ? messageDisplay.content : '';
}

export function ChatTranscriptMessageAttachments({
    attachments,
}: {
    attachments: MessageAttachment[];
}) {
    if (attachments.length === 0) {
        return null;
    }

    return (
        <>
            {attachments.map((attachment) => {
                if (attachment.type === 'file') {
                    return <MessageFileReference attachment={attachment} key={attachment.path} />;
                }

                if (isImageAttachment(attachment)) {
                    return <ChatMessageImage attachment={attachment} key={attachment.filename} />;
                }

                const dataUrl = `data:${attachment.mediaType};base64,${attachment.dataBase64}`;

                return (
                    <Attachment key={attachment.filename}>
                        <AttachmentMedia>
                            <FileTextIcon />
                        </AttachmentMedia>
                        <AttachmentContent>
                            <AttachmentTitle>{attachment.filename}</AttachmentTitle>
                            <AttachmentDescription>{attachment.mediaType}</AttachmentDescription>
                        </AttachmentContent>
                        <AttachmentDownloadLink download={attachment.filename} href={dataUrl}>
                            <span className="sr-only">Download {attachment.filename}</span>
                        </AttachmentDownloadLink>
                    </Attachment>
                );
            })}
        </>
    );
}

export function renderTranscriptMessageAttachments(
    attachments: MessageAttachment[] | null | undefined
) {
    if (!attachments || attachments.length === 0) {
        return null;
    }

    return <ChatTranscriptMessageAttachments attachments={attachments} />;
}

function MessageFileReference({
    attachment,
}: {
    attachment: Extract<MessageAttachment, { type: 'file' }>;
}) {
    const description = getFileAttachmentDescription(attachment);

    return (
        <Attachment>
            <AttachmentMedia>
                <FileTextIcon />
            </AttachmentMedia>
            <AttachmentContent>
                <AttachmentTitle>{attachment.filename}</AttachmentTitle>
                {description ? <AttachmentDescription>{description}</AttachmentDescription> : null}
                <AttachmentDescription className="font-mono">
                    {attachment.path}
                </AttachmentDescription>
            </AttachmentContent>
        </Attachment>
    );
}

function getFileAttachmentDescription(attachment: Extract<MessageAttachment, { type: 'file' }>) {
    const parts = ['File reference'];

    if (attachment.sizeBytes !== null && attachment.sizeBytes !== undefined) {
        parts.push(formatAttachmentBytes(attachment.sizeBytes));
    }

    if (attachment.mediaType) {
        parts.push(attachment.mediaType);
    }

    return parts.join(' - ');
}

function isImageAttachment(attachment: Extract<MessageAttachment, { type: 'inline' }>) {
    return (
        attachment.type === 'inline' &&
        ['image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(attachment.mediaType)
    );
}

function formatAttachmentBytes(sizeBytes: number) {
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }

    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
