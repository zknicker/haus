import { Button } from '@heroui/react';
import { ChatMessage, EmojiPicker } from '@heroui-pro/react';
import { SmileIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { ActionTooltip } from '../chat-action-tooltip.tsx';
import {
    type TranscriptMessageRow,
    useTranscriptRenderContextOptional,
} from '../chat-transcript-render-context.tsx';
import { reactionEmojiCatalog } from '../reactions/reaction-emoji-catalog.ts';

export const quickReactionEmoji = ['👍', '❤️', '🎉', '👀', '🔥', '😂', '✅'] as const;

// The standard quick reactions offered directly in the hover actions bar.
const actionBarEmoji = ['👍', '❤️', '😂', '💯'] as const;

/** Quick standard emoji plus the full picker for the hover actions bar. */
export function MessageReactionActions({
    className,
    row,
}: {
    className?: string;
    row: TranscriptMessageRow;
}) {
    const context = useTranscriptRenderContextOptional();
    const toggle = context?.onToggleReaction;

    if (!toggle) {
        return null;
    }

    return (
        <>
            {actionBarEmoji.map((emoji) => (
                <ActionTooltip key={emoji} label={`React with ${emoji}`}>
                    <ChatMessage.Action
                        aria-label={`React with ${emoji}`}
                        className={className}
                        onPress={() =>
                            toggle({
                                emoji,
                                messageId: row.message.id,
                                remove: hasOwnReaction(row, emoji, context?.viewerUserId),
                            })
                        }
                    >
                        {/* 17px splits text-base and text-lg: emoji ink doesn't
                            fill its em-box the way the stroke icons fill their
                            viewbox, so 16px reads too small next to the icons
                            and 18px reads too big. */}
                        <span className="text-[17px] leading-none">{emoji}</span>
                    </ChatMessage.Action>
                </ActionTooltip>
            ))}
            <MessageReactionPicker row={row} />
        </>
    );
}

/** The full searchable picker behind a compact smiley trigger. */
export function MessageReactionPicker({ row }: { row: TranscriptMessageRow }) {
    const context = useTranscriptRenderContextOptional();
    const toggle = context?.onToggleReaction;

    if (!toggle) {
        return null;
    }

    return (
        <ActionTooltip label="Add reaction">
            <EmojiPicker
                aria-label="Add reaction"
                onSelectionChange={(key) => {
                    if (typeof key === 'string') {
                        toggle({
                            emoji: key,
                            messageId: row.message.id,
                            remove: hasOwnReaction(row, key, context?.viewerUserId),
                        });
                    }
                }}
                selectedKey={null}
            >
                <EmojiPicker.Trigger
                    aria-label="Add reaction"
                    // The stock trigger ships unstyled by design; these
                    // documented HeroUI button classes make it identical
                    // to its ChatMessage.Action siblings in the bar.
                    className="button button--icon-only button--sm button--ghost chat-message__action size-7 shrink-0 [&_svg]:size-4"
                >
                    <Icon icon={SmileIcon} />
                </EmojiPicker.Trigger>
                <EmojiPicker.Popover placement="bottom end">
                    <EmojiPicker.Content>
                        <EmojiPicker.Grid items={reactionEmojiCatalog}>
                            {(item) => (
                                <EmojiPicker.Item id={item.emoji} textValue={item.name}>
                                    {item.emoji}
                                </EmojiPicker.Item>
                            )}
                        </EmojiPicker.Grid>
                    </EmojiPicker.Content>
                </EmojiPicker.Popover>
            </EmojiPicker>
        </ActionTooltip>
    );
}

/** Quick strip for the message context menu. */
export function QuickReactionStrip({ row }: { row: TranscriptMessageRow }) {
    const context = useTranscriptRenderContextOptional();
    const toggle = context?.onToggleReaction;

    if (!toggle) {
        return null;
    }

    return (
        <div className="flex gap-0.5">
            {quickReactionEmoji.map((emoji) => (
                <Button
                    aria-label={`React with ${emoji}`}
                    isIconOnly
                    key={emoji}
                    onPress={() =>
                        toggle({
                            emoji,
                            messageId: row.message.id,
                            remove: hasOwnReaction(row, emoji, context?.viewerUserId),
                        })
                    }
                    size="sm"
                    variant="ghost"
                >
                    {emoji}
                </Button>
            ))}
        </div>
    );
}

export function hasOwnReaction(row: TranscriptMessageRow, emoji: string, viewerUserId?: string) {
    return (
        viewerUserId !== undefined &&
        (row.message.reactions
            ?.find((reaction) => reaction.emoji === emoji)
            ?.actors.some(({ id }) => id === viewerUserId) ??
            false)
    );
}
