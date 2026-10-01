import { Button, Tooltip } from '@heroui/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { SortableTabList } from './sortable-tab-list.tsx';

/**
 * The main strip: the primary tab, browser tabs, and main artifact and Agent
 * tabs in one sortable list, then the new-tab button.
 */
export function WorkspaceTabStrip() {
    const workspace = useBrowserWorkspace();
    if (!(workspace && getDesktopBridge()?.browserCommand)) {
        return null;
    }
    return (
        <div className="workspace-tabs">
            <SortableTabList
                group="main"
                label="Workspace tabs"
                onReorder={workspace.reorderTabs}
                tabs={workspace.tabs}
            />
            <span className="workspace-new-tab">
                <Tooltip>
                    <Button
                        aria-label="New browser tab"
                        isIconOnly
                        onPress={() => workspace.command({ kind: 'new' })}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={Add01Icon} size={16} />
                    </Button>
                    <Tooltip.Content>New browser tab</Tooltip.Content>
                </Tooltip>
            </span>
        </div>
    );
}
