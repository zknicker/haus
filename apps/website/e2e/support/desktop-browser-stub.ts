import type { Page } from '@playwright/test';
import type { BrowserCommand, BrowserWorkspaceState } from '../../src/lib/desktop-browser.ts';

/**
 * Stands in for the Electron desktop bridge: an in-memory browser workspace
 * plus the bridge calls the App makes at startup, so the App renders its
 * desktop shell (workspace tabs, the split) in a plain browser.
 */
export async function installDesktopBrowserStub(page: Page) {
    await page.addInitScript(() => {
        let state: BrowserWorkspaceState = { activeId: null, tabs: [] };
        const listeners = new Set<(state: BrowserWorkspaceState) => void>();
        const openTab = (url: string, reuse: boolean) => {
            const existing = reuse ? state.tabs.find((tab) => tab.url === url) : undefined;
            const id = existing?.id ?? crypto.randomUUID();
            if (!existing) {
                state.tabs.push({
                    id,
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
            }
            state.activeId = id;
        };
        const navigate = (input: Extract<BrowserCommand, { kind: 'navigate' }>) => {
            if (input.action === 'back') {
                document.documentElement.dataset.browserHistory = 'back';
                return;
            }
            const tab = state.tabs.find((item) => item.id === state.activeId);
            if (input.action === 'url' && tab) {
                tab.url = input.url;
                tab.title = new URL(input.url).hostname;
                tab.loading = false;
            }
        };
        const apply = (input: BrowserCommand) => {
            switch (input.kind) {
                case 'new':
                    return openTab('about:blank', false);
                case 'open':
                    return openTab(input.url, true);
                case 'reorder':
                    state.tabs = input.ids.flatMap((id) =>
                        state.tabs.filter((tab) => tab.id === id)
                    );
                    return;
                case 'select':
                    state.activeId = input.id;
                    return;
                case 'close':
                    state.tabs = state.tabs.filter((tab) => tab.id !== input.id);
                    state.activeId = state.tabs.at(-1)?.id ?? null;
                    return;
                case 'reset':
                    state = { activeId: null, tabs: [] };
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
                // The last region the App reported for the native page (null: hidden).
                browserBounds: async (bounds: unknown) => {
                    Object.assign(window, { __browserBounds: bounds });
                },
                onBrowserState: (listener: (state: BrowserWorkspaceState) => void) => {
                    listeners.add(listener);
                    return () => listeners.delete(listener);
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
                onSsoCallback: () => () => undefined,
                runEditCommand: async () => undefined,
                checkForUpdate: async () => undefined,
                startWindowDrag: async () => undefined,
            },
        });
    });
}
