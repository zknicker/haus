import type { ChatMessage, ChatMessageReplyReference } from '@haus/api';
import { Button, Tooltip } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion';
import { Icon } from '../../../components/ui/icon.tsx';
import { messagePreviewLine } from '../../chats/message-preview-line.ts';

/** The app-local selection carried by the Channel/DM composer. */
export interface ChatInlineReplyTarget {
    author: ChatMessage['author'];
    content: string;
    messageId: string;
    parent: ChatMessageReplyReference;
    root: ChatMessageReplyReference;
}

export function toChatInlineReplyTarget(message: ChatMessage): ChatInlineReplyTarget {
    const parent = {
        author: message.author,
        content: message.content.slice(0, 280),
        createdAt: message.createdAt,
        id: message.id,
        sequence: message.sequence,
    } satisfies ChatMessageReplyReference;

    return {
        author: message.author,
        content: message.content,
        messageId: message.id,
        parent,
        root: message.reply?.root ?? parent,
    };
}

/** The compact selection banner above the composer editor. */
export function ChatInlineReplyReference({
    onCancel,
    target,
}: {
    onCancel: () => void;
    target: ChatInlineReplyTarget | null;
}) {
    const reduceMotion = useReducedMotion();

    return (
        <AnimatePresence initial={false}>
            {target ? (
                <motion.div
                    animate={{ height: 'auto', opacity: 1 }}
                    className="overflow-hidden"
                    exit={{
                        height: 0,
                        opacity: 0,
                        transition: {
                            duration: reduceMotion ? 0 : 0.12,
                            ease: [0.22, 1, 0.36, 1],
                        },
                    }}
                    initial={{ height: 0, opacity: 0 }}
                    key="reply"
                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                    <ReplyReferenceContent onCancel={onCancel} target={target} />
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}

function ReplyReferenceContent({
    onCancel,
    target,
}: {
    onCancel: () => void;
    target: ChatInlineReplyTarget;
}) {
    const isPresent = useIsPresent();
    const author = chatMessageAuthorName(target.parent.author);
    const excerpt = messagePreviewLine(target.parent.content) || 'Attachment';

    return (
        <fieldset
            aria-label={`Replying to ${author}: ${excerpt}`}
            className="prompt-input__reply"
            data-inline-reply-reference=""
            inert={!isPresent}
            title={excerpt}
        >
            <p className="min-w-0 flex-1 truncate text-muted text-sm">
                Replying to <span className="font-semibold text-foreground">{author}</span>
            </p>
            <Tooltip delay={0}>
                <Button
                    aria-label="Cancel reply"
                    isIconOnly
                    onPress={onCancel}
                    preventFocusOnPress
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Cancel01Icon} size={20} />
                </Button>
                <Tooltip.Content>Cancel reply</Tooltip.Content>
            </Tooltip>
        </fieldset>
    );
}

export function chatMessageAuthorName(author: ChatMessage['author']) {
    if (author.kind === 'agent') {
        return author.profile?.displayName ?? author.agentId;
    }

    return author.profile?.displayName ?? author.userId;
}
