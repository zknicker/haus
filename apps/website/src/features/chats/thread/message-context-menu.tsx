import { Button, Label, Toolbar, toast } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import {
    Activity01Icon,
    BubbleChatIcon,
    Copy01Icon,
    ReplyIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { useState } from 'react';
import { Icon } from '../../../components/ui/icon.tsx';
import { writeClipboardText } from '../../../lib/clipboard.ts';
import { cn } from '../../../lib/utils.ts';
import {
    getMessageCopyText,
    type TranscriptMessageRow,
    useTranscriptRenderContextOptional,
} from '../chat-transcript-render-context.tsx';
import { useMessageContextActions } from './message-context-actions.tsx';
import { hasOwnReaction, quickReactionEmoji } from './message-reactions.tsx';
import { isThreadAnchorRow } from './thread-anchor.ts';

export function MessageContextMenu({
    children,
    className,
    onMessageHover,
    row,
}: {
    children: React.ReactNode;
    className?: string;
    onMessageHover?: () => void;
    row: TranscriptMessageRow;
}) {
    const context = useTranscriptRenderContextOptional();
    const messageActions = useMessageContextActions();
    const canReply = Boolean(context?.threadActionsEnabled && isThreadAnchorRow(row));
    const canReplyInline = Boolean(context?.onSelectInlineReply && isThreadAnchorRow(row));
    const canReact = Boolean(context?.onToggleReaction && isThreadAnchorRow(row));
    const [open, setOpen] = useState(false);

    const react = (emoji: string) => {
        setOpen(false);
        context?.onToggleReaction?.({
            emoji,
            messageId: row.message.id,
            remove: hasOwnReaction(row, emoji, context?.viewerUserId),
        });
    };

    const onAction = (key: React.Key) => {
        if (key === 'copy') {
            writeClipboardText(getMessageCopyText(context, row.message))
                .then(() => toast.success('Message copied'))
                .catch(() => toast.danger('Could not copy the message'));
            return;
        }
        if (key === 'reply' && canReply) {
            context?.onOpenThread(row);
            return;
        }
        if (key === 'reply-inline' && canReplyInline) {
            context?.onSelectInlineReply?.(row.message);
            return;
        }
        if (key === 'details') {
            messageActions?.onViewTurnDetails();
        }
    };

    return (
        <ContextMenu onOpenChange={setOpen} open={open}>
            <ContextMenu.Trigger
                className={cn('group/message-row relative block min-w-0 rounded-lg', className)}
                data-message-id={row.message.id}
                onMouseEnter={onMessageHover}
            >
                {children}
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                {canReact ? (
                    <>
                        <Toolbar
                            aria-label="Add reaction"
                            className="justify-between px-2.5 pt-2.5 pb-1.5"
                        >
                            {quickReactionEmoji.map((emoji) => (
                                <Button
                                    aria-label={`React with ${emoji}`}
                                    isIconOnly
                                    key={emoji}
                                    onPress={() => react(emoji)}
                                    size="md"
                                    variant={
                                        hasOwnReaction(row, emoji, context?.viewerUserId)
                                            ? 'secondary'
                                            : 'ghost'
                                    }
                                >
                                    <span className="text-[17px] leading-none">{emoji}</span>
                                </Button>
                            ))}
                        </Toolbar>
                        <ContextMenu.Separator />
                    </>
                ) : null}
                <ContextMenu.Menu aria-label="Message actions" onAction={onAction}>
                    <ContextMenu.Item id="copy" textValue="Copy message">
                        <Icon aria-hidden="true" icon={Copy01Icon} size={16} />
                        <Label>Copy message</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Item id="reply" isDisabled={!canReply} textValue="Reply in thread">
                        <Icon aria-hidden="true" icon={BubbleChatIcon} size={16} />
                        <Label>Reply in thread</Label>
                    </ContextMenu.Item>
                    {canReplyInline ? (
                        <ContextMenu.Item id="reply-inline" textValue="Reply">
                            <Icon aria-hidden="true" icon={ReplyIcon} size={16} />
                            <Label>Reply</Label>
                        </ContextMenu.Item>
                    ) : null}
                    {messageActions ? (
                        <ContextMenu.Item id="details" textValue="View turn details">
                            <Icon aria-hidden="true" icon={Activity01Icon} size={16} />
                            <Label>View turn details</Label>
                        </ContextMenu.Item>
                    ) : null}
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
