import type * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * The one content column for routed destinations, encoding HeroUI's page idiom
 * (`mx-auto flex w-full flex-col gap-8 p-6`) against our spacing token.
 *
 * It owns three things so nothing below it has to: the page gutter, the max
 * width, and the rhythm between sections. Modules inside it — Widget,
 * ItemCardGroup, Card — already carry their own header and content padding, so
 * they are dropped in directly rather than wrapped in padded `<section>`s.
 * Doubling padding between a parent and its children is what drove page spacing
 * to 15px on one destination and 40px on another.
 *
 * Every destination shares one max width — `max-w-6xl` (1152px). A 3xl
 * default with per-page `wide` overrides made sibling pages (an Agent's
 * overview beside its Computer's page) visibly different widths one click
 * apart; 1152px reads as full width in ordinary windows, keeps wide tables
 * (the seven-column usage DataGrid needs 800px+) uncropped, and only centers
 * on genuinely large monitors. Do not reintroduce per-page width variants.
 *
 * Chat is deliberately exempt: it is a full-height surface with its own scroll
 * and composer geometry, not a document column. So is an Agent's Activity
 * log, a full-bleed list under a pinned band, like the Tasks list.
 */
export function PageColumn({ className, ...props }: React.ComponentProps<'div'>) {
    return (
        <div
            className={cn(
                // px-6 is the content reading gutter — deeper than the shell
                // band's px-3 chrome gutter; pt-8 gives the page header room
                // to breathe.
                'mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-8 pb-16',
                className
            )}
            {...props}
        />
    );
}
