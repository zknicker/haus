import { toast } from '@heroui/react';
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import {
    type BrowserHistoryEntry,
    useBrowserHistory,
} from '../../hooks/browser/use-browser-history.ts';
import { useBrowserShortcuts } from '../../hooks/browser/use-browser-shortcuts.ts';
import { useBrowserWorkspaceLinks } from '../../hooks/browser/use-browser-workspace-links.ts';
import { useDesktopTabPane } from '../../hooks/desktop/use-desktop-window-commands.ts';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import {
    type BrowserCommand,
    type BrowserWorkspaceState,
    parseBrowserWorkspace,
} from '../../lib/desktop-browser.ts';

const emptyState: BrowserWorkspaceState = { activeId: null, tabs: [] };
interface BrowserWorkspace {
    chatRoute: boolean;
    command: (command: BrowserCommand) => void;
    history: BrowserHistoryEntry[];
    routeLabel: string;
    state: BrowserWorkspaceState;
}
const BrowserWorkspaceContext = React.createContext<BrowserWorkspace | null>(null);

export function BrowserWorkspaceProvider({
    children,
    routeLabel,
    chatRoute,
}: {
    children: React.ReactNode;
    routeLabel: string;
    chatRoute: boolean;
}) {
    const [state, setState] = React.useState(emptyState);
    const history = useBrowserHistory(state.tabs);
    const location = useLocation();
    const bridge = getDesktopBridge();
    const command = React.useCallback(
        (input: BrowserCommand) => {
            void bridge?.browserCommand?.(input).catch((error: Error) => {
                toast.danger('Browser action failed', { description: error.message });
            });
        },
        [bridge]
    );
    useBrowserWorkspaceLinks(command);
    useBrowserShortcuts(state, command);
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
    React.useEffect(() => {
        if (location.key) {
            command({ kind: 'select', id: null });
        }
    }, [command, location.key]);
    useDesktopTabPane({
        active: state.activeId !== null,
        closeActiveTab: () => {
            if (!state.activeId) {
                return false;
            }
            command({ kind: 'close', id: state.activeId });
            return true;
        },
        openNewTab: () => {
            command({ kind: 'new' });
            return true;
        },
    });
    const value = React.useMemo(
        () => ({ state, history, command, routeLabel, chatRoute }),
        [state, history, command, routeLabel, chatRoute]
    );
    return <BrowserWorkspaceContext value={value}>{children}</BrowserWorkspaceContext>;
}

export function useBrowserWorkspace() {
    return React.use(BrowserWorkspaceContext);
}
