import { Button, Tooltip } from '@heroui/react';
import { Add01Icon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../components/ui/icon.tsx';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import type { PaneSide } from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { openNewTabPage } from '../../hooks/desktop-tabs/use-desktop-tab-shortcuts.ts';
import { SortableTabList } from './sortable-tab-list.tsx';

/**
 * One pane's tab row in the window band (ADR 0039): its sortable tabs, then
 * New tab (the new tab page, in this pane). The row always shows, even with one tab.
 * Pressing anywhere on it makes its pane the focused one. A dragged tab finds
 * the row by `data-tab-row` (`tab-drag/`).
 */
export function WorkspaceTabStrip({ label, pane }: { label: string; pane: PaneSide }) {
    const tabs = useDesktopTabs();
    const focusRow = () => tabs.focusPane(pane);
    return (
        <div
            className="workspace-tabs"
            data-pane={pane}
            data-tab-row={pane}
            onFocusCapture={focusRow}
            onPointerDownCapture={focusRow}
        >
            <SortableTabList label={label} pane={pane} />
            <span className="workspace-new-tab">
                <Tooltip>
                    <Button
                        aria-label="New tab"
                        isIconOnly
                        onPress={() => openNewTabPage(tabs)}
                        size="sm"
                        variant="ghost"
                    >
                        <Icon aria-hidden="true" icon={Add01Icon} size={16} />
                    </Button>
                    <Tooltip.Content>New tab</Tooltip.Content>
                </Tooltip>
            </span>
        </div>
    );
}
