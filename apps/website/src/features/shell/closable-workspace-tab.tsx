import { Button } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import type * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import type { ClosableTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { SortableWorkspaceTab } from './sortable-workspace-tab.tsx';
import { WorkspaceTabAction } from './workspace-tab.tsx';

/**
 * A browser page, artifact, Agent, or Thread tab. Every closable kind closes
 * from its trailing button or a middle-click, and reorders with every other
 * tab in its strip.
 */
export function ClosableWorkspaceTab({
    className,
    label,
    mark,
    onDoubleClick,
    tabRef,
    tooltip,
}: {
    /** A `.workspace-tab` BEM modifier, such as the preview tab's. */
    className?: string;
    label: string;
    mark: React.ReactNode;
    onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
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
            className={className}
            label={label}
            mark={mark}
            onAuxClick={(event) => {
                if (event.button === 1) {
                    event.preventDefault();
                    close();
                }
            }}
            onDoubleClick={onDoubleClick}
            tabRef={tabRef}
            tooltip={tooltip}
        />
    );
}
