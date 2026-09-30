import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Tooltip } from '@heroui/react';
import * as React from 'react';
import {
    type WorkspaceTabRef,
    workspaceTabId,
} from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';
import { WorkspaceTab, WorkspaceTabLabel } from './workspace-tab.tsx';

/**
 * One tab in the sortable strip, for every kind: the tab selects on press,
 * drags from its title (or Space, arrows, Space), and scrolls into view when
 * selected. Kinds add their own trailing action and tooltip.
 */
export function SortableWorkspaceTab({
    action,
    className,
    label,
    mark,
    onAuxClick,
    tabRef,
    tooltip,
}: {
    action?: React.ReactNode;
    className?: string;
    label: string;
    mark: React.ReactNode;
    onAuxClick?: React.MouseEventHandler<HTMLDivElement>;
    tabRef: WorkspaceTabRef;
    tooltip?: React.ReactNode;
}) {
    const workspace = useBrowserWorkspace();
    const id = workspaceTabId(tabRef);
    const active = workspace ? workspaceTabId(workspace.activeTab) === id : false;
    const {
        setNodeRef,
        setActivatorNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });
    const element = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        if (active) {
            element.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }, [active]);
    const button = (
        <Button
            {...attributes}
            {...listeners}
            aria-pressed={active}
            onKeyDown={(event) => {
                listeners?.onKeyDown?.(event);
                event.continuePropagation();
            }}
            onPress={() => workspace?.selectTab(tabRef)}
            onPressStart={(event) => event.continuePropagation()}
            ref={setActivatorNodeRef}
            size="sm"
            variant="ghost"
        >
            {mark}
            <WorkspaceTabLabel>{label}</WorkspaceTabLabel>
        </Button>
    );
    return (
        <WorkspaceTab
            action={action}
            active={active}
            className={className}
            data-dragging={isDragging}
            kind={tabRef.kind}
            onAuxClick={onAuxClick}
            ref={(node) => {
                element.current = node;
                setNodeRef(node);
            }}
            style={{ transform: CSS.Transform.toString(transform), transition }}
        >
            {tooltip ? (
                <Tooltip delay={600}>
                    {button}
                    <Tooltip.Content placement="bottom">{tooltip}</Tooltip.Content>
                </Tooltip>
            ) : (
                button
            )}
        </WorkspaceTab>
    );
}
