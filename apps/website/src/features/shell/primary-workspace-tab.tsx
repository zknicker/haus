import { primaryTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { SortableWorkspaceTab } from './sortable-workspace-tab.tsx';
import { PrimaryTabMark } from './workspace-tab-mark.tsx';

/**
 * The tab that follows sidebar navigation: the routed page's identity mark and
 * title, at a fixed width so switching chats never moves the strip. It sorts
 * like any other tab but never closes. The page's actions live at the band's
 * end (WorkspaceBandActions), not in this tab.
 */
export function PrimaryWorkspaceTab() {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    const identity = workspace.primaryTab;
    return (
        <SortableWorkspaceTab
            className="workspace-primary-tab"
            label={identity.label}
            mark={<PrimaryTabMark identity={identity} />}
            tabRef={primaryTabRef}
        />
    );
}
