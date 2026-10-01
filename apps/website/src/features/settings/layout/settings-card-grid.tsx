import { Button } from '@heroui/react';
import { ItemCard, ItemCardGroup, PressableFeedback } from '@heroui-pro/react';
import { Tick02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type React from 'react';
import { Icon } from '../../../components/ui/icon.tsx';

/**
 * A browsable catalog section on a Settings page — Skills and Connections
 * share it so the two catalogs read as one look: a titled, stock
 * `ItemCardGroup` in its grid layout, two calm rows per line.
 *
 * Composition, not configuration: the section owns the header and the grid,
 * each `SettingsGridCard` / `SettingsGridItem` is one row, and its children
 * are stock `ItemCard` parts (`.Icon`, `.Content`, `.Title`, `.Description`,
 * `.Action`). Rows are the transparent card variant, so a catalog reads as a
 * list of products rather than a wall of boxes; the theme keeps the grid from
 * handing them a surface back (`default-theme.css`, `item-card-group--grid`).
 * The `--catalog` modifier carries the rest of the look — app-icon tiles, the
 * reading width, the divided header — so call sites stay stock.
 */
export function SettingsCardGrid({
    action,
    children,
    count,
    footer,
    status,
    title,
}: {
    /** A control for the section as a whole, at the header's trailing edge. */
    action?: React.ReactNode;
    children?: React.ReactNode;
    count?: number;
    /** Under the grid — `SettingsCardGridMore` when the section is collapsed. */
    footer?: React.ReactNode;
    /** Replaces the grid while there is nothing to list: loading, error, or empty. */
    status?: React.ReactNode;
    title: React.ReactNode;
}) {
    return (
        <ItemCardGroup className="item-card-group--catalog" variant="transparent">
            <ItemCardGroup.Header className="flex items-center justify-between gap-3">
                <ItemCardGroup.Title>
                    {title}
                    {count === undefined ? null : (
                        // The leading space keeps "Installed 150" two words
                        // to assistive tech; the margin is the visual gap.
                        <span className="ms-2 text-muted tabular-nums">
                            <span className="sr-only"> </span>
                            {count}
                        </span>
                    )}
                </ItemCardGroup.Title>
                {action}
            </ItemCardGroup.Header>
            {status ?? (
                // Stock grid is a fixed two columns; a narrow column takes one
                // so titles keep room to read before they truncate.
                <ItemCardGroup className="max-sm:grid-cols-1" columns={2} layout="grid">
                    {children}
                </ItemCardGroup>
            )}
            {footer}
        </ItemCardGroup>
    );
}

/** One pressable row in a `SettingsCardGrid`, rendered as a button. */
export function SettingsGridCard({
    children,
    label,
    onPress,
}: {
    children: React.ReactNode;
    /** Accessible name when the visible title alone is ambiguous. */
    label?: string;
    onPress: () => void;
}) {
    return (
        <ItemCard<'button'>
            aria-label={label}
            className="relative w-full min-w-0 cursor-(--cursor-interactive) overflow-hidden text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
            // The handler rides on ItemCard, not on the rendered button:
            // `render` spreads the component's own props last.
            onClick={onPress}
            render={(props) => <button type="button" {...props} />}
            variant="transparent"
        >
            <PressableFeedback.Highlight />
            {children}
        </ItemCard>
    );
}

/**
 * A row that is not itself pressable — it carries its own control in
 * `ItemCard.Action`, which a button row could not nest. No hover state: only
 * the control is interactive.
 */
export function SettingsGridItem({ children }: { children: React.ReactNode }) {
    return (
        <ItemCard className="min-w-0" variant="transparent">
            {children}
        </ItemCard>
    );
}

/**
 * The quiet trailing mark for a row that is already in place — an installed
 * skill, a ready connection. A row that needs attention shows its status
 * instead; one that can be added shows its add control.
 */
export function SettingsGridCheck({
    label,
}: {
    /** Names the state when the section title does not already say it. */
    label?: string;
}) {
    return (
        <ItemCard.Action>
            <Icon aria-label={label} className="text-muted" icon={Tick02Icon} size={18} />
        </ItemCard.Action>
    );
}

/**
 * "See A, B, and 4 more" under a collapsed grid. Naming what is hidden says
 * more than a bare count, and the first two names are usually enough to tell
 * whether the one you want is in there. The theme mutes it and sets it off
 * from the grid (`.item-card-group--catalog`).
 */
export function SettingsCardGridMore({
    hiddenNames,
    onPress,
}: {
    hiddenNames: readonly string[];
    onPress: () => void;
}) {
    if (hiddenNames.length === 0) {
        return null;
    }
    return (
        <Button className="self-start" onPress={onPress} size="sm" variant="ghost">
            {seeMoreLabel(hiddenNames)}
        </Button>
    );
}

export function seeMoreLabel(names: readonly string[]): string {
    const [first, second] = names;
    if (names.length === 1) {
        return `See ${first}`;
    }
    if (names.length === 2) {
        return `See ${first} and ${second}`;
    }
    return `See ${first}, ${second}, and ${names.length - 2} more`;
}
