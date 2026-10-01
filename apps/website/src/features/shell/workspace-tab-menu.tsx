import { Label } from '@heroui/react';
import { ContextMenu } from '@heroui-pro/react';
import { Cancel01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import {
    type AppTabRef,
    isAppTab,
    workspaceTabId,
} from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

/**
 * One right-click menu for a whole strip: it opens for the artifact, Agent, or
 * Thread tab under the pointer and closes it. Browser and primary tabs have
 * no menu.
 */
export function WorkspaceTabMenu({ children }: { children: React.ReactNode }) {
    const workspace = useBrowserWorkspace();
    const [target, setTarget] = React.useState<AppTabRef | null>(null);
    const pending = React.useRef<AppTabRef | null>(null);
    if (!workspace) {
        return children;
    }
    const appTabs = workspace.tabs.filter(isAppTab);
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
                <ContextMenu.Menu
                    onAction={() => {
                        if (target) {
                            workspace.closeTab(target);
                        }
                    }}
                >
                    <ContextMenu.Item id="close" textValue="Close tab">
                        <Icon aria-hidden="true" icon={Cancel01Icon} size={16} />
                        <Label>Close tab</Label>
                    </ContextMenu.Item>
                </ContextMenu.Menu>
            </ContextMenu.Popover>
        </ContextMenu>
    );
}
