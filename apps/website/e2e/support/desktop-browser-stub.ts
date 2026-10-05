import type { Page } from '@playwright/test';
import type { BrowserCommand, BrowserWorkspaceState } from '../../src/lib/desktop-browser.ts';

/**
 * Stands in for the Electron desktop bridge: an in-memory browser workspace
 * plus the bridge calls the App makes at startup, so the App renders its
 * desktop shell (workspace tabs, the split) in a plain browser.
 */
export async function installDesktopBrowserStub(page: Page) {
    await page.addInitScript((flag) => {
        // `openDesktopWindow` asks for a window with no stored tabs. Forgetting them here, at
        // document start, wins over the previous page's last tab write on pagehide.
        if (sessionStorage.getItem(flag)) {
            for (const key of Object.keys(sessionStorage)) {
                if (key === flag || key.startsWith('haus.desktopTabs.')) {
                    sessionStorage.removeItem(key);
                }
            }
        }
        // Mirror test URLs into Electron's hash routes before its router boots.
        if (location.pathname.startsWith('/s/') && !location.hash) {
            history.replaceState(
                null,
                '',
                `${location.pathname}${location.search}#${location.pathname}${location.search}`
            );
        }
        // Mirrors electron/browser-workspace.cjs (ADR 0039): App-named views, no selection.
        let state: BrowserWorkspaceState = { tabs: [] };
        const listeners = new Set<(state: BrowserWorkspaceState) => void>();
        const openRequests = new Set<(request: unknown) => void>();
        const openView = (url: string, viewId: string) => {
            if (state.tabs.some((tab) => tab.id === viewId)) {
                return;
            }
            state.tabs.push({
                id: viewId,
                url,
                title: url === 'about:blank' ? 'New tab' : new URL(url).hostname,
                loading: false,
                error: null,
                faviconUrl: null,
                canGoBack: false,
                canGoForward: false,
                zoomFactor: 1,
                find: null,
            });
        };
        // A web link without a view name asks the App for a tab, as Electron does.
        const requestOpen = (url: string) => {
            for (const listener of openRequests) {
                listener({ url, openerId: null, background: false });
            }
        };
        const navigate = (input: Extract<BrowserCommand, { kind: 'navigate' }>) => {
            if (input.action === 'back') {
                document.documentElement.dataset.browserHistory = 'back';
                return;
            }
            const tab = state.tabs.find((item) => item.id === input.id);
            if (input.action === 'url' && tab) {
                tab.url = input.url;
                tab.title = new URL(input.url).hostname;
                tab.loading = false;
            }
        };
        const apply = (input: BrowserCommand) => {
            switch (input.kind) {
                case 'new':
                    return input.viewId ? openView('about:blank', input.viewId) : undefined;
                case 'open':
                    return input.viewId
                        ? openView(input.url, input.viewId)
                        : requestOpen(input.url);
                case 'close':
                    state.tabs = state.tabs.filter((tab) => tab.id !== input.id);
                    return;
                case 'reset':
                    state = { tabs: [] };
                    return;
                case 'navigate':
                    return navigate(input);
                default:
                    return;
            }
        };
        const command = async (input: BrowserCommand) => {
            apply(input);
            for (const listener of listeners) {
                listener(structuredClone(state));
            }
            return state;
        };
        Object.defineProperty(window, 'hausDesktop', {
            value: {
                browserCommand: command,
                browserSnapshot: async () => structuredClone(state),
                // The last placements the App reported for native views ([]: none shown).
                browserLayout: async (placements: unknown) => {
                    Object.assign(window, { __browserLayout: placements });
                },
                onBrowserState: (listener: (state: BrowserWorkspaceState) => void) => {
                    listeners.add(listener);
                    return () => listeners.delete(listener);
                },
                onBrowserOpenRequest: (listener: (request: unknown) => void) => {
                    openRequests.add(listener);
                    return () => openRequests.delete(listener);
                },
                getInfo: async () => ({ platform: 'darwin', isPackaged: false, version: '0.0.0' }),
                authTokenGet: async () => null,
                setTheme: async () => undefined,
                setDockBadge: async () => undefined,
                onUpdateStatus: () => () => undefined,
                onHistoryNavigate: (listener: (direction: 'back' | 'forward') => void) => {
                    const handler = () => listener('back');
                    window.addEventListener('test:desktop-history', handler);
                    return () => window.removeEventListener('test:desktop-history', handler);
                },
                // Menu accelerators Electron forwards as shortcuts (⌘⇧T, ⌘1–9, Control-Tab).
                onBrowserShortcut: (listener: (shortcut: string) => void) => {
                    const handler = (event: Event) =>
                        listener((event as CustomEvent<string>).detail);
                    window.addEventListener('test:desktop-shortcut', handler);
                    return () => window.removeEventListener('test:desktop-shortcut', handler);
                },
                // File > Close (⌘W) and File > New Tab (⌘T) arrive as menu requests in Electron.
                onCloseWindowRequest: (listener: () => void) => {
                    window.addEventListener('test:desktop-close', listener);
                    return () => window.removeEventListener('test:desktop-close', listener);
                },
                onNewTabRequest: (listener: () => void) => {
                    window.addEventListener('test:desktop-new-tab', listener);
                    return () => window.removeEventListener('test:desktop-new-tab', listener);
                },
                closeWindow: async () => {
                    document.documentElement.dataset.windowClosed = 'true';
                },
                onSsoCallback: () => () => undefined,
                runEditCommand: async () => undefined,
                checkForUpdate: async () => undefined,
                startWindowDrag: async () => undefined,
            },
        });
    }, freshWindowFlag);
}

const freshWindowFlag = 'e2e.freshDesktopWindow';

/**
 * Opens a fresh desktop window on `path`. A window's stored tabs win over its route
 * (ADR 0039: the route only seeds a window with no tabs), so this forgets them first.
 */
export async function openDesktopWindow(page: Page, path: string) {
    // The stub's init script forgets them on the next document, after the old page's last write.
    await page.evaluate((flag) => sessionStorage.setItem(flag, '1'), freshWindowFlag);
    await page.goto(`/#${path}`);
}

/**
 * Splits a one-pane window: the tab menu's Move to right pane on the tab named
 * `tabName` opens the second pane with it (links never open it on their own).
 */
export async function moveTabToRightPane(page: Page, tabName: string) {
    await page
        .getByRole('navigation', { exact: true, name: 'Tabs' })
        .locator('.workspace-tab')
        .filter({ hasText: tabName })
        .click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Move to right pane' }).click();
    await page
        .getByRole('navigation', { exact: true, name: 'Right pane tabs' })
        .waitFor({ state: 'visible' });
}
