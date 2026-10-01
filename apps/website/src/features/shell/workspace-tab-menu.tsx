import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { Cancel01Icon, LayoutRightIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type AppTabRef,
    type WorkspaceTabGroup,
    workspaceTabId,
} from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

/**
 * One right-click menu for a whole strip: it opens for the artifact or Agent
 * tab under the pointer and moves it to the other group or closes it. Browser
 * and primary tabs have no menu (browser tabs stay in the main strip).
 */
export function WorkspaceTabMenu({
    children,
    group,
}: {
    children: React.ReactNode;
    group: WorkspaceTabGroup;
}) {
    const workspace = useBrowserWorkspace();
    const [target, setTarget] = React.useState<AppTabRef | null>(null);
    const pending = React.useRef<AppTabRef | null>(null);
    if (!workspace) {
        return children;
    }
    const appTabs: AppTabRef[] =
        group === 'split'
            ? workspace.split.order
            : workspace.tabs.filter(
                  (ref): ref is AppTabRef => ref.kind === 'artifact' || ref.kind === 'agent'
              );
    const onAction = (key: React.Key) => {
        if (!target) {
            return;
        }
        if (key === 'move') {
            workspace.moveTab(target, group === 'main' ? 'split' : 'main');
        } else if (key === 'close') {
            workspace.closeTab(target);
        }
    };
    return (
        <ContextMenu
            onOpenChange={(open) => {
                setTarget(open ? pending.current : null);
            }}
            open={target !== null}
        >
            <ContextMenu.Trigger className="flex min-w-0 flex-[0_1_auto]">
                {/* Notes the tab under the pointer before the trigger opens the menu. */}
                <div
                    className="contents"
                    onContextMenuCapture={(event) => {
                        const id = (event.target as Element)
                            .closest('[data-tab-id]')
                            ?.getAttribute('data-tab-id');
                        pending.current = appTabs.find((ref) => workspaceTabId(ref) === id) ?? null;
                    }}
                >
                    {children}
                </div>
            </ContextMenu.Trigger>
            <ContextMenu.Popover>
                <ContextMenu.Menu onAction={onAction}>
                    <ContextMenu.Item
                        id="move"
                        textValue={group === 'main' ? 'Move to split view' : 'Move to main'}
                    >
                        <Icon aria-hidden="true" icon={LayoutRightIcon} size={16} />
                        <Label>{group === 'main' ? 'Move to split view' : 'Move to main'}</Label>
                    </ContextMenu.Item>
                    <ContextMenu.Separator />
                    <ContextMenu.Item id="close" textValue="Close tab">
                        <Icon aria-hidden="true" icon={Cancel01Icon} size={16} />
                        <Label>Close tab</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
