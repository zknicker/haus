import type { Agent } from '@haus/api';
import { ItemCard, PressableFeedback } from '@heroui-pro/react';
import type { ReactNode } from 'react';
import { EntityAvatar } from '../../../components/ui/entity-avatar.tsx';
import { AgentAvatar } from '../../members/agent-avatar.tsx';

/** Every Inbox mark is this size, Agent, Channel, or week card alike. */
export const inboxMarkSize = 32;

/**
 * One Inbox row: a stock `ItemCard` rendered as the button that opens it.
 *
 * This row carries no control of its own, so the card itself is the press
 * target — `ItemCard`'s documented Pressable composition, the same one the
 * week cards in the strip use. A row with an action uses `InboxActionRow`.
 *
 * The row carries no height of its own. `ItemCard`'s padding around a 32px
 * mark is the band, which is the whole point of the recomposition: the list
 * this replaced pinned a 40px row and then spent CSS undoing the component's
 * spacing to fit it.
 */
export function InboxRow({
    children,
    label,
    onOpen,
}: {
    children: ReactNode;
    /** The row's accessible name, so a row announces as the thing it opens. */
    label: string;
    onOpen: () => void;
}) {
    return (
        <ItemCard<'button'>
            aria-label={label}
            className="item-card--inbox relative w-full cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
            onClick={onOpen}
            render={(props) => <button type="button" {...props} />}
        >
            <PressableFeedback.Highlight />
            {children}
        </ItemCard>
    );
}

/**
 * An Inbox row that carries one action of its own — Done on a Needs you row.
 *
 * The card cannot be the button here, because a button may not hold another
 * interactive element. So the card stays a plain `ItemCard`, and the press
 * target is a button stretched over it: it still opens the row from anywhere
 * on the card, takes the tab stop, and carries the row's name. The action
 * sits above that button in `ItemCard.Action`, beside the press target rather
 * than inside it.
 */
export function InboxActionRow({
    action,
    children,
    label,
    meta,
    onOpen,
}: {
    /** The one control the row carries, at the trailing edge. */
    action: ReactNode;
    children: ReactNode;
    label: string;
    /** The trailing cluster `InboxRowMeta` carries on a plain row. */
    meta: ReactNode;
    onOpen: () => void;
}) {
    return (
        <ItemCard className="item-card--inbox relative w-full overflow-hidden">
            <PressableFeedback.Highlight />
            <button
                aria-label={label}
                className="absolute inset-0 cursor-(--cursor-interactive) rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
                onClick={onOpen}
                type="button"
            />
            {children}
            <ItemCard.Action>
                <span className="flex items-center gap-2 text-muted text-xs">
                    {meta}
                    {/* Positioned, so it paints above the stretched button. */}
                    <span className="relative flex items-center">{action}</span>
                </span>
            </ItemCard.Action>
        </ItemCard>
    );
}

/**
 * The row's leading mark. It sits beside `ItemCard.Content` rather than inside
 * `ItemCard.Icon`: an avatar and a channel box are already marks with their own
 * ground, and the icon slot exists to give a bare glyph one.
 */
export function InboxRowMark({ children }: { children: ReactNode }) {
    return <span className="flex shrink-0">{children}</span>;
}

/**
 * One identity grammar for every Inbox row: the Agent's own face when the
 * Server still knows it, and its initials when the Agent is gone.
 */
export function InboxIdentityMark({
    agent,
    avatarUrl,
    name,
}: {
    agent: Agent | null;
    avatarUrl?: null | string;
    name: string;
}) {
    return (
        <InboxRowMark>
            {agent ? (
                <AgentAvatar agent={agent} size={inboxMarkSize} />
            ) : (
                <EntityAvatar name={name} size={inboxMarkSize} src={avatarUrl ?? null} />
            )}
        </InboxRowMark>
    );
}

/**
 * A glyph standing in for a face: a brand logo centered in the same mark
 * column the Agent avatars occupy, so a Cloud Agent row and an Agent row share
 * one text edge. No box — a provider logo is already a mark, and putting a
 * ground behind it only competes with the avatars beside it.
 */
export function InboxGlyphMark({ children }: { children: ReactNode }) {
    return (
        <InboxRowMark>
            <span
                className="flex items-center justify-center"
                style={{ height: inboxMarkSize, width: inboxMarkSize }}
            >
                {children}
            </span>
        </InboxRowMark>
    );
}

/**
 * The row's single line of text.
 *
 * `ItemCard.Content` stacks its title over its description, so the line itself
 * is a structural wrapper inside it — layout only; the type is still the card's
 * own Title and Description, arranged side by side rather than stacked.
 *
 * The title keeps its own width rather than shrinking to make room: it is the
 * thing being scanned, and a column of half-titles is a column you have to open
 * to read. Past 40% of the line it truncates, so one long title cannot take the
 * preview's width with it. The preview fills whatever the title leaves and is
 * the first thing to give way, the way an email list's preview does.
 */
export function InboxRowBody({ preview, title }: { preview: ReactNode; title: ReactNode }) {
    return (
        <ItemCard.Content>
            <span className="flex min-w-0 items-center gap-2">
                <ItemCard.Title className="max-w-[40%] shrink-0">{title}</ItemCard.Title>
                <ItemCard.Description className="min-w-0 flex-1">{preview}</ItemCard.Description>
            </span>
        </ItemCard.Content>
    );
}

/**
 * The trailing cluster: where the row came from and how it stands — a
 * mention's Chat, a Chat's time and unread count, a run's status. It never wraps and
 * never shrinks, so every row in the column ends on the same right edge and
 * reads in the same grammar.
 */
export function InboxRowMeta({ children }: { children: ReactNode }) {
    return (
        <ItemCard.Action>
            <span className="flex items-center gap-2 text-muted text-xs">{children}</span>
        </ItemCard.Action>
    );
}
