import { Button, Toolbar, Tooltip } from '@heroui/react';
import {
    ArrowLeft02Icon,
    ArrowRight02Icon,
    Cancel01Icon,
    ReloadIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

/** Back, Forward, and Reload/Stop for the selected browser tab. */
export function BrowserWorkspaceNavigation({ tab }: { tab: BrowserTab }) {
    const workspace = useBrowserWorkspace();
    const reloadLabel = tab.loading ? 'Stop loading' : 'Reload page';
    return (
        <Toolbar aria-label="Page navigation">
            <BrowserToolbarButton
                icon={<Icon icon={ArrowLeft02Icon} size={16} />}
                isDisabled={!tab.canGoBack}
                label="Back"
                onPress={() => workspace?.command({ kind: 'navigate', action: 'back' })}
                shortcut="⌘["
            />
            <BrowserToolbarButton
                icon={<Icon icon={ArrowRight02Icon} size={16} />}
                isDisabled={!tab.canGoForward}
                label="Forward"
                onPress={() => workspace?.command({ kind: 'navigate', action: 'forward' })}
                shortcut="⌘]"
            />
            <BrowserToolbarButton
                icon={<Icon icon={tab.loading ? Cancel01Icon : ReloadIcon} size={16} />}
                label={reloadLabel}
                onPress={() =>
                    workspace?.command({
                        kind: 'navigate',
                        action: tab.loading ? 'stop' : 'reload',
                    })
                }
                shortcut={tab.loading ? undefined : '⌘R'}
            />
        </Toolbar>
    );
}

/** An icon-only toolbar action whose tooltip names it and, when bound, its shortcut. */
export function BrowserToolbarButton({
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
            {/* Top placement keeps hover tooltips off the native page, so it never swaps to a snapshot (see useBrowserViewBounds). */}
            <Tooltip.Content placement="top">
                {label}
                {shortcut ? <kbd className="ms-2 font-sans text-muted">{shortcut}</kbd> : null}
            </Tooltip.Content>
        </Tooltip>
    );
}
