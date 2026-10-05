import { Button, Kbd, Toolbar, Tooltip } from '@heroui/react';
import {
    ArrowLeft02Icon,
    ArrowRight02Icon,
    Cancel01Icon,
    ReloadIcon,
} from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import {
    type HistoryDirection,
    pageHistoryStep,
    stepPageHistory,
} from '../../hooks/browser/page-history-step.ts';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { useTabPresence } from '../../hooks/desktop-tabs/tab-presence.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';

/** Back, Forward, and Reload/Stop for one web view. */
export function BrowserWorkspaceNavigation({ tab }: { tab: BrowserTab }) {
    const workspace = useBrowserViews();
    const reloadLabel = tab.loading ? 'Stop loading' : 'Reload page';
    return (
        <Toolbar aria-label="Page navigation">
            <PageHistoryButtons view={tab} />
            <BrowserToolbarButton
                icon={<Icon icon={tab.loading ? Cancel01Icon : ReloadIcon} size={16} />}
                label={reloadLabel}
                onPress={() =>
                    workspace?.command({
                        kind: 'navigate',
                        action: tab.loading ? 'stop' : 'reload',
                        id: tab.id,
                    })
                }
                shortcut={tab.loading ? undefined : '⌘R'}
            />
        </Toolbar>
    );
}

/**
 * Back and Forward for the tab this page sits in: a web page's own history
 * first (`view`), then the tab's, so Back from a site chosen on the new tab
 * page returns there.
 */
export function PageHistoryButtons({ view }: { view: BrowserTab | null }) {
    const workspace = useBrowserViews();
    const tabs = useDesktopTabs();
    const { tabId } = useTabPresence();
    const history = tabId ? tabs.tab(tabId)?.history : undefined;
    const can = (direction: HistoryDirection) =>
        history !== undefined && pageHistoryStep({ direction, history, view }) !== null;
    const step = (direction: HistoryDirection) => {
        if (tabId) {
            stepPageHistory({ direction, tabId, tabs, views: workspace });
        }
    };
    return (
        <>
            <BrowserToolbarButton
                icon={<Icon icon={ArrowLeft02Icon} size={16} />}
                isDisabled={!can('back')}
                label="Back"
                onPress={() => step('back')}
                shortcut="⌘["
            />
            <BrowserToolbarButton
                icon={<Icon icon={ArrowRight02Icon} size={16} />}
                isDisabled={!can('forward')}
                label="Forward"
                onPress={() => step('forward')}
                shortcut="⌘]"
            />
        </>
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
                {shortcut ? <Kbd>{shortcut}</Kbd> : null}
            </Tooltip.Content>
        </Tooltip>
    );
}
