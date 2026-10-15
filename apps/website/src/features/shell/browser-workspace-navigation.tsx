import { Toolbar } from '@heroui/react';
import { Cancel01Icon, ReloadIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { PageToolbarButton } from './page-toolbar.tsx';

/**
 * Reload/Stop for one web view. Back and Forward lead the pane's tab row
 * (`PaneHistoryButtons`), walking the page's own history first.
 */
export function BrowserWorkspaceNavigation({ tab }: { tab: BrowserTab }) {
    const workspace = useBrowserViews();
    const reloadLabel = tab.loading ? 'Stop loading' : 'Reload page';
    return (
        <Toolbar aria-label="Page navigation">
            <PageToolbarButton
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
