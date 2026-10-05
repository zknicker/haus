import { toast } from '@heroui/react';
import type * as React from 'react';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import { tabsToRight } from '../../hooks/desktop-tabs/desktop-tabs-commands.ts';
import { useDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import {
    currentLocation,
    newTabLocation,
    paneOfTab,
    type TabLocation,
} from '../../hooks/desktop-tabs/desktop-tabs-model.ts';
import { selectionFor } from '../../hooks/desktop-tabs/desktop-tabs-selection.ts';
import { canMoveToNewWindow } from '../../hooks/desktop-tabs/move-tabs-to-new-window.ts';
import { writeClipboardText } from '../../lib/clipboard.ts';
import { openSystemBrowserLink } from '../../lib/open-external-link.ts';
import { tabLink } from './tab-link.ts';
import { tabPaneMove } from './workspace-tab-move.ts';

type WebLocation = Extract<TabLocation, { kind: 'browser' }>;

/**
 * What the tab menu offers for the tab under the pointer (ADR 0039). Like
 * Chrome's `GetIndicesForCommand`, commands act on that row's whole
 * multi-selection when the tab is in it, else on that tab alone. Reload and
 * Open in default browser act on the web pages among them; Copy link needs
 * one tab. `run` returns false for a key it does not own (a chat action).
 */
export function useWorkspaceTabMenu(target: string | null) {
    const tabs = useDesktopTabs();
    const browser = useBrowserViews();
    const { state } = tabs;
    const targets = target ? selectionFor(state, target) : [];
    const pane = target ? paneOfTab(state, target) : null;
    const others = (pane ? (state[pane]?.tabIds ?? []) : []).filter((id) => !targets.includes(id));
    const toRight = tabsToRight(state, targets);
    const move = targets.length > 0 ? tabPaneMove(state, targets) : null;
    const locations = targets.flatMap((id) => {
        const tab = tabs.tab(id);
        return tab ? [currentLocation(tab)] : [];
    });
    const web = locations.filter(
        (location): location is WebLocation => location.kind === 'browser'
    );
    const single = targets.length === 1 && locations[0] ? locations[0] : null;
    const link = single ? tabLink(single) : null;
    const last = targets.at(-1);

    const run = (key: React.Key): boolean => {
        switch (key) {
            case 'new-tab-right':
                if (last) {
                    tabs.openAfter(last, newTabLocation);
                }
                return true;
            case 'reload':
                for (const location of web) {
                    browser?.command({ action: 'reload', id: location.viewId, kind: 'navigate' });
                }
                return true;
            case 'duplicate':
                tabs.duplicate(targets);
                return true;
            case 'copy-link':
                if (link) {
                    writeClipboardText(link)
                        .then(() => toast.success('Link copied'))
                        .catch(() => toast.danger('Could not copy the link'));
                }
                return true;
            case 'open-external':
                for (const location of web) {
                    void openSystemBrowserLink(location.url);
                }
                return true;
            case 'move':
                if (move) {
                    tabs.move(targets, move.to);
                }
                return true;
            case 'new-window':
                tabs.moveToNewWindow(targets);
                return true;
            case 'close':
                tabs.close(targets);
                return true;
            case 'close-others':
                tabs.close(others);
                return true;
            case 'close-right':
                tabs.close(toRight);
                return true;
            default:
                return false;
        }
    };

    return {
        canCloseOthers: others.length > 0,
        canCloseRight: toRight.length > 0,
        canMoveToNewWindow: canMoveToNewWindow(state, targets),
        hasLink: link !== null,
        hasWebPage: web.length > 0,
        many: targets.length > 1,
        move,
        run,
        single: targets.length === 1 ? target : null,
    };
}

export type WorkspaceTabMenuModel = ReturnType<typeof useWorkspaceTabMenu>;
