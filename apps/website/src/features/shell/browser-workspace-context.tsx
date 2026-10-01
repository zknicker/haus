import { toast } from '@heroui/react';
import * as React from 'react';
import { type Location, useLocation, useNavigationType } from 'react-router-dom';
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
import { primaryTabRef } from '../../hooks/workspace-tabs/workspace-tabs-model.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    type BrowserCommand,
    type BrowserWorkspaceState,
    parseBrowserWorkspace,
} from '../../lib/desktop-browser.ts';
import type { ServerDetail } from '../../lib/haus-server.tsx';
import type { PrimaryTabIdentity } from './primary-tab-identity.ts';
import { revealsRoutedPage } from './routed-page-reveal.ts';

const emptyState: BrowserWorkspaceState = { activeId: null, tabs: [] };
interface BrowserWorkspace extends WorkspaceTabs {
    chatRoute: boolean;
    command: (command: BrowserCommand) => void;
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
    const location = useLocation();
    const navigationType = useNavigationType();
    const bridge = getDesktopBridge();
    const command = React.useCallback(
        (input: BrowserCommand) => {
            void bridge?.browserCommand?.(input).catch((error: Error) => {
                toast.danger('Browser action failed', { description: error.message });
            });
        },
        [bridge]
    );
    const tabs = useWorkspaceTabs({
        browser: state,
        command,
        serverId,
        source: chatRoute ? primaryTab.label : null,
    });
    useBrowserWorkspaceLinks(command);
    const find = useBrowserFind(state.activeId, command);
    useBrowserShortcuts({
        browserTab: state.tabs.find((tab) => tab.id === state.activeId) ?? null,
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
        command({ kind: 'mount' });
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
            command({ kind: 'reset' });
        };
    }, [bridge, command]);
    const { activeTab, closeFocusedTab, focusGroup, selectTab, split } = tabs;
    const routed = React.useRef<Location | null>(null);
    React.useEffect(() => {
        const previous = routed.current;
        routed.current = location;
        if (revealsRoutedPage(previous, location, navigationType)) {
            selectTab(primaryTabRef);
        }
    }, [selectTab, location, navigationType]);
    // Native browser pages take focus without a DOM event; they only live in the main strip.
    React.useEffect(() => bridge?.onBrowserFocus?.(() => focusGroup('main')), [bridge, focusGroup]);
    useDesktopTabPane({
        active: activeTab.kind !== 'primary' || split.active !== null,
        closeActiveTab: closeFocusedTab,
        openNewTab: () => {
            command({ kind: 'new' });
            return true;
        },
    });
    const value = React.useMemo(
        () => ({ ...tabs, state, history, command, find, primaryTab, chatRoute, server, serverId }),
        [tabs, state, history, command, find, primaryTab, chatRoute, server, serverId]
    );
    return <BrowserWorkspaceContext value={value}>{children}</BrowserWorkspaceContext>;
}

export function useBrowserWorkspace() {
    return React.use(BrowserWorkspaceContext);
}

/** True while a main-strip browser, artifact, or Agent tab covers the routed page; split tabs never do. */
export function useCoveringTabSelected(): boolean {
    const kind = React.use(BrowserWorkspaceContext)?.activeTab.kind;
    return kind !== undefined && kind !== 'primary';
}
