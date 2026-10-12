import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { LayoutRightIcon, PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type DesktopTabCommands,
    useOptionalDesktopTabs,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';

export const openInNewTabKey = 'open-new-tab';
export const openOnRightKey = 'open-on-right';

/** A sidebar row's tab openers; null on the web, which has no tabs. */
export interface RowTabOpeners {
    /** "Open in new tab": a background tab after the left pane's selected tab, like ⌘-click. */
    openInNewTab: (path: string) => void;
    /** "Open on the right": the Open verb, a selected tab in the right pane. */
    openOnRight: (path: string) => void;
}

export function useRowTabOpeners(): RowTabOpeners | null {
    return rowTabOpeners(useOptionalDesktopTabs());
}

export function rowTabOpeners(
    tabs: Pick<DesktopTabCommands, 'open' | 'openTab'> | null
): RowTabOpeners | null {
    if (!tabs) {
        return null;
    }
    return {
        openInNewTab: (path) => tabs.openTab(null, { kind: 'app', path }, { background: true }),
        openOnRight: (path) => tabs.open(null, { kind: 'app', path }),
    };
}

/** Runs a row menu's tab items; false for any other key. */
export function runRowTabItem(
    openers: RowTabOpeners | null,
    key: React.Key,
    path: string
): boolean {
    if (!openers) {
        return false;
    }
    if (key === openInNewTabKey) {
        openers.openInNewTab(path);
        return true;
    }
    if (key === openOnRightKey) {
        openers.openOnRight(path);
        return true;
    }
    return false;
}

/** The row menu's tab items; render them right after the row's Open item. */
export function RowTabItems() {
    return (
        <>
            <ContextMenu.Item id={openInNewTabKey} textValue="Open in new tab">
                <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
                <Label>Open in new tab</Label>
            </ContextMenu.Item>
            <ContextMenu.Item id={openOnRightKey} textValue="Open on the right">
                <Icon aria-hidden="true" icon={LayoutRightIcon} size={16} />
                <Label>Open on the right</Label>
            </ContextMenu.Item>
        </>
    );
}
