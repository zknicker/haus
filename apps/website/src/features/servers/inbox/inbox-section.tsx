import { ItemCardGroup } from '@heroui-pro/react';
import type { ReactNode } from 'react';

/**
 * One Inbox section, in `ItemCardGroup`'s own grammar: a transparent group
 * whose header carries the title, and whose body is whatever that section
 * shows beneath it.
 *
 * Every section — Unread in the feed, Agents and Happening now in the rail — is
 * this shape, so every label is the same type at the same edge, over one box
 * of rows (`InboxSectionRows`). Unread's box is its triage list, one row open.
 *
 * The title used to sit inside the bordered box, with a borderless divided list
 * nested under it — a hybrid that put a rule between every pair of rows but
 * none under the heading they belonged to. Label outside, box below is what
 * HeroUI's own usage example does.
 */
export function InboxSection({
    children,
    meta,
    title,
}: {
    children: ReactNode;
    /**
     * A muted fact at the header's trailing edge that says what the section's
     * numbers count (`Tokens · 7d`), so no row has to repeat it. It sits beside
     * the title, not in it, so the heading still announces as the title alone.
     */
    meta?: ReactNode;
    title: ReactNode;
}) {
    return (
        <ItemCardGroup className="item-card-group--inbox" variant="transparent">
            {meta === undefined ? (
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>{title}</ItemCardGroup.Title>
                </ItemCardGroup.Header>
            ) : (
                // HeroUI's own header-with-trailing-content composition.
                <ItemCardGroup.Header className="flex items-baseline justify-between gap-3">
                    <ItemCardGroup.Title>{title}</ItemCardGroup.Title>
                    <span className="shrink-0 text-muted text-xs">{meta}</span>
                </ItemCardGroup.Header>
            )}
            {children}
        </ItemCardGroup>
    );
}

/**
 * The rows under a section's label, separated. `boxed` sets them inside one
 * bordered group, which clips so the first and last row's hover fill follows
 * its corners. `bare` sets them straight on the page with only the hairlines
 * between them: Unread's triage list, whose one open row is the only outlined
 * thing in it, so no outline ever sits inside another. Bare does not clip,
 * so that open row's ring keeps its edges.
 */
export function InboxSectionRows({
    children,
    variant = 'boxed',
}: {
    children: ReactNode;
    variant?: 'bare' | 'boxed';
}) {
    return variant === 'bare' ? (
        <ItemCardGroup className="item-card-group--inbox-rows" variant="transparent">
            {children}
        </ItemCardGroup>
    ) : (
        <ItemCardGroup className="item-card-group--inbox-rows overflow-hidden">
            {children}
        </ItemCardGroup>
    );
}

/**
 * The neutral region a section reserves while its query settles. An unresolved
 * query is not an empty collection, so nothing is claimed until it is — and no
 * empty box is drawn on the way there.
 */
export function InboxSectionPending({ label }: { label: string }) {
    return (
        <div aria-busy="true">
            <span className="sr-only">{label}</span>
        </div>
    );
}
