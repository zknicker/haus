import { toast } from '@heroui/react';
import * as React from 'react';
import { browserWorkspaceLifecycle } from '../../hooks/browser/browser-workspace-lifecycle.ts';
import { type BrowserFind, useBrowserFind } from '../../hooks/browser/use-browser-find.ts';
import {
    type BrowserHistoryEntry,
    useBrowserHistory,
} from '../../hooks/browser/use-browser-history.ts';
import { useBrowserShortcuts } from '../../hooks/browser/use-browser-shortcuts.ts';
import { useBrowserWorkspaceLinks } from '../../hooks/browser/use-browser-workspace-links.ts';
import { useDesktopTabPane } from '../../hooks/desktop/use-desktop-window-commands.ts';
import {
    useWorkspaceTabs,
    type WorkspaceTabs,
} from '../../hooks/workspace-tabs/use-workspace-tabs.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    type BrowserCommand,
    type BrowserWorkspaceState,
    parseBrowserWorkspace,
} from '../../lib/desktop-browser.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import type { PrimaryTabIdentity } from './primary-tab-identity.ts';
import { useRoutedPageTabs } from './use-routed-page-tabs.ts';

const emptyState: BrowserWorkspaceState = { activeId: null, tabs: [] };
interface BrowserWorkspace extends WorkspaceTabs {
    chatRoute: boolean;
    find: BrowserFind;
    history: BrowserHistoryEntry[];
    primaryTab: PrimaryTabIdentity;
    server: ServerDetail;
    serverId: string;
    state: BrowserWorkspaceState;
}
const BrowserWorkspaceContext = React.createContext<BrowserWorkspace | null>(null);

export function BrowserWorkspaceProvider({
    children,
    primaryTab,
    chatRoute,
    server,
}: {
    children: React.ReactNode;
    primaryTab: PrimaryTabIdentity;
    chatRoute: boolean;
    server: ServerDetail;
}) {
    const serverId = server.id;
    const [state, setState] = React.useState(emptyState);
    const history = useBrowserHistory(state.tabs);
    const bridge = getDesktopBridge();
    const runCommand = React.useCallback(
        async (input: BrowserCommand): Promise<unknown> =>
            await bridge?.browserCommand?.(input).catch((error: Error) => {
                toast.danger('Browser action failed', { description: error.message });
                return null;
            }),
        [bridge]
    );
    const tabs = useWorkspaceTabs({
        browser: state,
        command: runCommand,
        serverId,
        source: chatRoute ? primaryTab.label : null,
    });
    const { command } = tabs;
    useBrowserWorkspaceLinks(command);
    const find = useBrowserFind(state.activeId, command);
    // Page shortcuts act on the shown page only; a hidden selected page takes none.
    const shownBrowserId = tabs.shownClosable?.kind === 'browser' ? tabs.shownClosable.id : null;
    useBrowserShortcuts({
        browserTab: state.tabs.find((tab) => tab.id === shownBrowserId) ?? null,
        command,
        find,
        tabs,
    });
    React.useEffect(() => {
        if (!(bridge?.browserSnapshot && bridge.onBrowserState)) {
            return;
        }
        let mounted = true;
        let receivedEvent = false;
        const accept = (value: unknown) => {
            const parsed = parseBrowserWorkspace(value);
            if (mounted && parsed) {
                setState(parsed);
            }
        };
        const unsubscribe = bridge.onBrowserState((value) => {
            receivedEvent = true;
            accept(value);
        });
        browserWorkspaceLifecycle.mount(serverId, () => void runCommand({ kind: 'mount' }));
        void bridge
            .browserSnapshot()
            .then((value) => {
                if (!receivedEvent) {
                    accept(value);
                }
            })
            .catch((error: Error) =>
                toast.danger('Browser unavailable', { description: error.message })
            );
        return () => {
            mounted = false;
            unsubscribe();
            browserWorkspaceLifecycle.unmount(serverId, () => void runCommand({ kind: 'reset' }));
        };
    }, [bridge, runCommand, serverId]);
    useRoutedPageTabs({ openAgent: tabs.openAgent, selectTab: tabs.selectTab, server });
    // Registered while any closable tab is open, so Command-W never closes the
    // window over open tabs (see `closeActiveTab`).
    useDesktopTabPane({
        active: tabs.tabs.length > 0,
        closeActiveTab: tabs.closeActiveTab,
        openNewTab: () => {
            command({ kind: 'new' });
            return true;
        },
    });
    const value = React.useMemo(
        () => ({ ...tabs, state, history, find, primaryTab, chatRoute, server, serverId }),
        [tabs, state, history, find, primaryTab, chatRoute, server, serverId]
    );
    return <BrowserWorkspaceContext value={value}>{children}</BrowserWorkspaceContext>;
}

export function useBrowserWorkspace() {
    return React.use(BrowserWorkspaceContext);
}

/** True while an expanded-mode tab covers the routed page; the side pane never does. */
export function useCoveringTabSelected(): boolean {
    const workspace = React.use(BrowserWorkspaceContext);
    return workspace?.mode === 'expanded' && workspace.shownClosable !== null;
}
