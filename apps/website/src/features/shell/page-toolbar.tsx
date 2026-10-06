import { Button, Kbd, Tooltip } from '@heroui/react';
import type * as React from 'react';
import { cn } from '../../lib/utils.ts';

/**
 * The class every page's top bar shares: a browser tab's toolbar, the new tab
 * page, an artifact page, and the Agent Workspace. `.page-toolbar` in the
 * theme layer owns the inset, the gap, the height, the bottom hairline, and
 * the tight cluster gap of a `Toolbar` inside it. Hosts that need a form or a
 * grid (the browser) put the class on their own element.
 */
export const pageToolbarClassName = 'page-toolbar';

/** A page's single top bar, laid out as one flex row. */
export function PageToolbar({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <header className={cn(pageToolbarClassName, 'flex shrink-0 items-center', className)}>
            {children}
        </header>
    );
}

/** An icon-only page toolbar action whose tooltip names it and, when bound, its shortcut. */
export function PageToolbarButton({
    icon,
    label,
    shortcut,
    isDisabled,
    onPress,
}: {
    icon: React.ReactNode;
    label: string;
    shortcut?: string;
    isDisabled?: boolean;
    onPress: () => void;
}) {
    return (
        <Tooltip>
            <Button
                aria-label={label}
                isDisabled={isDisabled}
                isIconOnly
                onPress={onPress}
                size="sm"
                variant="ghost"
            >
                {icon}
            </Button>
            {/* Top placement keeps hover tooltips off a native browser page, so it never swaps to a snapshot (see useBrowserViewBounds). */}
            <Tooltip.Content placement="top">
                {label}
                {shortcut ? <Kbd>{shortcut}</Kbd> : null}
            </Tooltip.Content>
        </Tooltip>
    );
}
