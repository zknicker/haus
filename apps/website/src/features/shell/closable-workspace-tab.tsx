import { Button } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import type { ClosableTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { SortableWorkspaceTab } from './sortable-workspace-tab.tsx';
import { WorkspaceTabAction } from './workspace-tab.tsx';

/**
 * A browser page or artifact tab. Both kinds close from their trailing button
 * or a middle-click, and reorder with every other tab in the one strip.
 */
export function ClosableWorkspaceTab({
    label,
    mark,
    tabRef,
    tooltip,
}: {
    label: string;
    mark: React.ReactNode;
    tabRef: ClosableTabRef;
    tooltip: React.ReactNode;
}) {
    const workspace = useBrowserWorkspace();
    const close = () => workspace?.closeTab(tabRef);
    return (
        <SortableWorkspaceTab
            action={
                <WorkspaceTabAction>
                    <Button
                        aria-label={`Close ${label}`}
                        isIconOnly
                        onPress={close}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={Cancel01Icon} size={14} />
                    </Button>
                </WorkspaceTabAction>
            }
            label={label}
            mark={mark}
            onAuxClick={(event) => {
                if (event.button === 1) {
                    event.preventDefault();
                    close();
                }
            }}
            tabRef={tabRef}
            tooltip={tooltip}
        />
    );
}
