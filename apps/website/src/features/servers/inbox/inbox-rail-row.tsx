import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import type { ReactNode } from 'react';
import { opensPlace } from '../../../hooks/desktop-tabs/tab-open-gesture.ts';
import { cn } from '../../../lib/utils.ts';

/** Every rail mark is this size: an Agent's face or a Cloud Agent's keycap. */
export const inboxMarkSize = 32;

/**
 * One row in the Inbox's narrow lists — the Agents meter and Happening now,
 * in the rail and in the strip's popovers: a stock `ItemCard` rendered as the
 * button that opens it — `ItemCard`'s documented Pressable composition.
 *
 * It stacks: the column is a third of the page, so a title and a preview side
 * by side would leave each a sliver. Title over subline is `ItemCard.Content`'s
 * own grammar, so the row keeps HeroUI's offset between the two.
 *
 * `tone="warning"` is the one state a row can be in: an Agent running away.
 * The theme layer tints it (`.item-card--inbox-warning`), because the row group
 * clears every row's own surface and only a rule there can give one back.
 */
export function InboxRailRow({
    children,
    label,
    onOpen,
    tone = 'default',
}: {
    children: ReactNode;
    /** The row's accessible name, so a row announces as the thing it opens. */
    label: string;
    onOpen: () => void;
    tone?: 'default' | 'warning';
}) {
    return (
        <ItemCard<'button'>
            aria-label={label}
            className={cn(
                'relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset',
                tone === 'warning' && 'item-card--inbox-warning'
            )}
            onClick={onOpen}
            render={(props) => <button type="button" {...props} {...opensPlace} />}
        >
            <PressableFeedback.Highlight />
            {children}
        </ItemCard>
    );
}

/**
 * The row's leading mark. It sits beside `ItemCard.Content` rather than inside
 * `ItemCard.Icon`: an avatar or a provider glyph is already a mark with its own
 * ground, and the icon slot exists to give a bare glyph one.
 */
export function InboxRailMark({ children }: { children: ReactNode }) {
    return <span className="flex shrink-0">{children}</span>;
}
