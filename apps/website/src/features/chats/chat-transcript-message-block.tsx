'use client';

import { ChatMessage } from '@heroui-pro/react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils.ts';

export interface TranscriptMessageBlockProps
    extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    attachments?: ReactNode;
    children?: ReactNode;
    from: 'user' | 'assistant';
}

/**
 * One message inside a transcript turn: prose body plus its attachments,
 * rendered through the stock Pro ChatMessage media/content slots. Every
 * message — the owner's included — reads as left-aligned plain text in one
 * Slack-style roster; `from` survives only as data-from so tests and tooling
 * can still tell who sent the row. Messages appear at full weight the instant
 * they are sent: no entrance motion, and nothing marks a send as unconfirmed.
 */
export function TranscriptMessageBlock({
    attachments,
    children,
    className,
    from,
    ...props
}: TranscriptMessageBlockProps) {
    const hasBody = children !== null && children !== undefined && children !== '';
    const hasAttachments = attachments !== null && attachments !== undefined;

    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-1',
                // Media is a block: one block step above and below it, so the
                // next grouped message never starts flush under the tiles.
                hasAttachments && 'gap-(--chat-block-gap) pb-(--chat-block-gap)',
                className
            )}
            data-from={from}
            {...props}
        >
            {hasBody ? <ChatMessage.Content>{children}</ChatMessage.Content> : null}
            {hasAttachments ? <ChatMessage.Media>{attachments}</ChatMessage.Media> : null}
        </div>
    );
}
