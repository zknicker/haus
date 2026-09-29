import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Tooltip } from '@heroui/react';
import { Cancel01Icon, Globe02Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

export function BrowserWorkspaceTab({ tab }: { tab: BrowserTab }) {
    const workspace = useBrowserWorkspace();
    const active = workspace?.state.activeId === tab.id;
    const {
        setNodeRef,
        setActivatorNodeRef,
        attributes,
        listeners,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: tab.id });
    const element = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        if (active) {
            element.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }, [active]);
    return (
        <div
            className="workspace-tab no-drag"
            data-active={active}
            data-dragging={isDragging}
            onAuxClick={(event) => {
                if (event.button === 1) {
                    event.preventDefault();
                    workspace?.command({ kind: 'close', id: tab.id });
                }
            }}
            ref={(node) => {
                element.current = node;
                setNodeRef(node);
            }}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                zIndex: isDragging ? 1 : undefined,
            }}
        >
            <Tooltip delay={600}>
                <Button
                    {...attributes}
                    {...listeners}
                    aria-pressed={active}
                    onKeyDown={(event) => {
                        listeners?.onKeyDown?.(event);
                        event.continuePropagation();
                    }}
                    onPress={() => workspace?.command({ kind: 'select', id: tab.id })}
                    onPressStart={(event) => event.continuePropagation()}
                    ref={setActivatorNodeRef}
                    size="sm"
                    variant="ghost"
                >
                    <Icon aria-hidden="true" icon={Globe02Icon} size={16} />
                    <span className="max-w-40 truncate">{tab.title}</span>
                </Button>
                <Tooltip.Content placement="bottom">
                    <p>{tab.title}</p>
                    <p className="text-muted text-xs">{tab.url}</p>
                </Tooltip.Content>
            </Tooltip>
            <Button
                aria-label={`Close ${tab.title}`}
                isIconOnly
                onPress={() => workspace?.command({ kind: 'close', id: tab.id })}
                size="sm"
                variant="ghost"
            >
                <Icon aria-hidden="true" icon={Cancel01Icon} size={16} />
            </Button>
        </div>
    );
}
