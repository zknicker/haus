import { Alert } from '@heroui/react';
import * as React from 'react';
import { cn } from '../../lib/utils.ts';
import {
    applyAgentMentionAppearance,
    readMentionsFromMarkdown,
} from '../mentions/mention-metadata.ts';
import { CollapsibleText } from '../rows/collapsible-text.tsx';
import { getMessageDisplay } from '../rows/message-display.ts';
import type { ChatTextAnimationRange } from './chat-inline-text-animation.tsx';
import { ChatMarkdownText } from './chat-markdown-text.tsx';
import type { TranscriptMessage } from './transcript-contract.ts';

export type { TranscriptMessage } from './transcript-contract.ts';

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
