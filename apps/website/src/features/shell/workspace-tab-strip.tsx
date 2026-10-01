import { Button, Tooltip } from '@heroui/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { SortableTabList } from './sortable-tab-list.tsx';

/**
 * A strip of every closable tab in one sortable list, then the new-tab button.
 * Expanded mode leads it with the primary tab; split mode shows it over the
 * side pane.
 */
export function WorkspaceTabStrip({
    label,
    leading,
}: {
    label: string;
    /** The primary tab, before the sortable tabs (expanded mode). */
    leading?: React.ReactNode;
}) {
    const workspace = useBrowserWorkspace();
    if (!workspace) {
        return null;
    }
    return (
        <div className="workspace-tabs">
            <SortableTabList
                label={label}
                leading={leading}
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
