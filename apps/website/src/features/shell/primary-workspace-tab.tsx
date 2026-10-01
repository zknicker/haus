import { primaryTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { SortableWorkspaceTab } from './sortable-workspace-tab.tsx';
import { PrimaryTabMark } from './workspace-tab-mark.tsx';

/**
 * The expanded strip's first tab, which follows sidebar navigation: the routed
 * page's identity mark and title, at a fixed width so switching chats never
 * moves the strip. It never moves or closes. The page's actions live in the
 * band (WorkspaceBandActions), not in this tab.
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

/**
 * Split mode's title over the routed page: the same identity as the primary
 * tab, as a plain heading-weight label rather than a tab (Codex).
 */
export function PrimaryPageTitle() {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    return (
        <div className="workspace-page-title">
            <PrimaryTabMark identity={workspace.primaryTab} />
            <span className="workspace-page-title__label">{workspace.primaryTab.label}</span>
        </div>
    );
}
