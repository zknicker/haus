import { ItemCardGroup } from '@heroui-pro/react';
import type { ReactNode } from 'react';

/**
 * One Inbox section, in `ItemCardGroup`'s own grammar: a transparent group
 * whose header carries the title, and whose body is whatever that section
 * shows beneath it.
 *
 * Every one of the four sections is this shape, so all four labels are the same
 * type at the same edge. Three of them put a bordered box of rows under the
 * label (`InboxSectionRows`); the week strip puts its cards there instead,
 * because cards already carry their own edges.
 *
 * The title used to sit inside the bordered box, with a borderless divided list
 * nested under it — a hybrid that put a rule between every pair of rows but
 * none under the heading they belonged to. Label outside, box below is what
 * HeroUI's own usage example does, and it is the grammar the strip already had.
 */
export function InboxSection({ children, title }: { children: ReactNode; title: ReactNode }) {
    return (
        <ItemCardGroup className="item-card-group--inbox" variant="transparent">
            <ItemCardGroup.Header>
                <ItemCardGroup.Title>{title}</ItemCardGroup.Title>
            </ItemCardGroup.Header>
            {children}
        </ItemCardGroup>
    );
}

/**
 * The box under a section's label: its rows, separated, inside one bordered
 * group. It rounds its corners but does not clip them on its own, so the first
 * and last row's hover fill is squared off without `overflow-hidden`.
 */
export function InboxSectionRows({ children }: { children: ReactNode }) {
    return (
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
