import { ContextMenu } from '@heroui-pro/react';
import * as React from 'react';
import { type TabChatActions, useTabChatActions, useTabChatMenu } from './use-tab-chat-actions.tsx';
import { useWorkspaceTabMenu } from './use-workspace-tab-menu.ts';
import { WorkspaceTabPageItems, WorkspaceTabPlaceItems } from './workspace-tab-menu-items.tsx';

/**
 * One right-click menu for a pane's row, modelled on Chrome's and Codex's tab
 * menus: it opens for the tab under the pointer and acts on that row's
 * multi-selection when the tab is in it, else on that tab alone (a
 * right-click never changes the selection; `useWorkspaceTabMenu`). A single
 * chat tab adds a Channel or DM submenu between the page and placement groups.
 * The menu's body reads tab, chat, and Agent state, and mounts only while
 * the menu is open.
 */
export function WorkspaceTabMenu({ children }: { children: React.ReactNode }) {
    const [target, setTarget] = React.useState<string | null>(null);
    const pending = React.useRef<string | null>(null);
    const chatActions = useTabChatActions();
    return (
        <>
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
                            pending.current =
                                (event.target as Element)
                                    .closest('[data-tab-id]')
                                    ?.getAttribute('data-tab-id') ?? null;
                        }}
                    >
                        {children}
                    </div>
                </ContextMenu.Trigger>
                <ContextMenu.Popover>
                    <WorkspaceTabMenuBody chatActions={chatActions} target={target} />
                </ContextMenu.Popover>
            </ContextMenu>
            {chatActions.dialogs}
        </>
    );
}

function WorkspaceTabMenuBody({
    chatActions,
    target,
}: {
    chatActions: TabChatActions;
    target: string | null;
}) {
    const model = useWorkspaceTabMenu(target);
    const chatMenu = useTabChatMenu(chatActions, model.single);
    return (
        <ContextMenu.Menu
            onAction={(key) => {
                if (target && !model.run(key)) {
                    chatMenu.onAction(key);
                }
            }}
        >
            <WorkspaceTabPageItems model={model} />
            {chatMenu.items}
            <ContextMenu.Separator />
            <WorkspaceTabPlaceItems model={model} />
        </ContextMenu.Menu>
    );
}
