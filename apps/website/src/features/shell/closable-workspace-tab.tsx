import { Button } from '@heroui/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import type { ClosableTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { SortableWorkspaceTab } from './sortable-workspace-tab.tsx';
import { WorkspaceTabAction } from './workspace-tab.tsx';

/**
 * How closable tabs render: as sortable strip tabs, or as plain rows in the
 * hidden side pane's open-tabs list, where pressing one reveals the pane on it.
 */
export const WorkspaceTabVariant = React.createContext<'list' | 'strip'>('strip');

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
    const variant = React.use(WorkspaceTabVariant);
    if (variant === 'list') {
        return (
            <Button onPress={() => workspace?.selectTab(tabRef)} size="sm" variant="ghost">
                {mark}
                {label}
            </Button>
        );
    }
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
