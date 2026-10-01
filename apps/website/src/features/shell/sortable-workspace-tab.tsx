import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Tooltip } from '@heroui/react';
import * as React from 'react';
import {
    sameTab,
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
    onDoubleClick,
    tabRef,
    tooltip,
}: {
    action?: React.ReactNode;
    className?: string;
    label: string;
    mark: React.ReactNode;
    onAuxClick?: React.MouseEventHandler<HTMLDivElement>;
    onDoubleClick?: React.MouseEventHandler<HTMLDivElement>;
    tabRef: WorkspaceTabRef;
    tooltip?: React.ReactNode;
}) {
    const workspace = useBrowserWorkspace();
    const id = workspaceTabId(tabRef);
    const active = sameTab(workspace?.selectedTab ?? null, tabRef);
    const {
        setNodeRef,
        setActivatorNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({ disabled: tabRef.kind === 'primary', id });
    // The primary tab leads the strip and never moves, so it takes no drag handle (whose
    // attributes would also mark it aria-disabled).
    const handle = tabRef.kind === 'primary' ? {} : { ...attributes, ...listeners };
    const element = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        if (active) {
            element.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }, [active]);
    const button = (
        <Button
            {...handle}
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
            data-tab-id={id}
            kind={tabRef.kind}
            onAuxClick={onAuxClick}
            onDoubleClick={onDoubleClick}
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
