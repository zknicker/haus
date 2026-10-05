import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { PlusSignIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type DesktopTabsApi,
    useOptionalDesktopTabs,
} from '../../hooks/desktop-tabs/desktop-tabs-context.ts';

export const openInNewTabKey = 'open-new-tab';

/**
 * A sidebar row's "Open in new tab": the same open as Command-clicking the row
 * (a shell push with the background-tab gesture, `resolveTabNavigation`), so the
 * page opens in a background tab after the focused pane's current tab, as
 * Chrome's link and bookmark menus do (NEW_BACKGROUND_TAB). Null on the web,
 * which has no tabs.
 */
export function useOpenInNewTab(): ((path: string) => void) | null {
    return newTabOpener(useOptionalDesktopTabs());
}

export function newTabOpener(
    tabs: Pick<DesktopTabsApi, 'openInFocusedPane'> | null
): ((path: string) => void) | null {
    if (!tabs) {
        return null;
    }
    return (path) => tabs.openInFocusedPane({ kind: 'app', path }, 'backgroundTab');
}

/** The menu item; render it right after the row's Open item. */
export function OpenInNewTabItem() {
    return (
        <ContextMenu.Item id={openInNewTabKey} textValue="Open in new tab">
            <Icon aria-hidden="true" icon={PlusSignIcon} size={16} />
            <Label>Open in new tab</Label>
        </ContextMenu.Item>
    );
}
