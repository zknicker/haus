import { toast } from '@heroui/react';
import * as React from 'react';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import { type BrowserWorkspaceState, parseBrowserWorkspace } from '../../lib/desktop-browser.ts';
import { type ClosedTab, insertTabAt, reopenedTab } from './closed-tabs.ts';
import type { ClosableTabRef } from './workspace-tabs-model.ts';
import type { AppTabInput } from './workspace-tabs-reducer.ts';

/**
 * Reopen Closed Tab (⌘⇧T): the newest closed tab returns to its old position
 * among the closable tabs, selected; a Thread reopens pinned. A browser page
 * reopens through Electron; an already-open page is selected where it is.
 */
export function useReopenClosedTab({
    closed,
    latest,
    open,
    reorderTabs,
}: {
    closed: React.RefObject<ClosedTab[]>;
    latest: React.RefObject<{ browser: BrowserWorkspaceState; tabs: ClosableTabRef[] }>;
    open: (input: AppTabInput) => void;
    reorderTabs: (tabs: ClosableTabRef[]) => void;
}) {
    return React.useCallback(() => {
        const entry = closed.current.at(-1);
        if (!entry) {
            return;
        }
        closed.current = closed.current.slice(0, -1);
        if (entry.kind !== 'browser') {
            const [input, ref] = reopenedTab(entry);
            open(input);
            reorderTabs(insertTabAt(latest.current.tabs, ref, entry.index));
            return;
        }
        const known = new Set(latest.current.browser.tabs.map((tab) => tab.id));
        void getDesktopBridge()
            ?.browserCommand?.({ kind: 'open', url: entry.url })
            .then((value) => {
                const id = parseBrowserWorkspace(value)?.activeId;
                if (id && !known.has(id)) {
                    reorderTabs(
                        insertTabAt(latest.current.tabs, { kind: 'browser', id }, entry.index)
                    );
                }
            })
            .catch((error: Error) =>
                toast.danger('Could not reopen the tab', { description: error.message })
            );
    }, [closed, latest, open, reorderTabs]);
}
