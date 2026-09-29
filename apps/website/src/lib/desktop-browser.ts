export interface BrowserTab {
    canGoBack: boolean;
    canGoForward: boolean;
    error: string | null;
    id: string;
    loading: boolean;
    title: string;
    url: string;
}
export interface BrowserWorkspaceState {
    activeId: string | null;
    tabs: BrowserTab[];
}
export type BrowserCommand =
    | { kind: 'mount' }
    | { kind: 'new' }
    | { kind: 'open'; url: string }
    | { kind: 'reorder'; ids: string[] }
    | { kind: 'select'; id: string | null }
    | { kind: 'close'; id: string }
    | { kind: 'reset' }
    | { kind: 'navigate'; action: 'back' | 'forward' | 'reload' | 'stop' }
    | { kind: 'navigate'; action: 'url'; url: string };
export interface BrowserBounds {
    height: number;
    width: number;
    x: number;
    y: number;
}

export function parseBrowserWorkspace(value: unknown): BrowserWorkspaceState | null {
    if (!value || typeof value !== 'object' || !('activeId' in value) || !('tabs' in value)) {
        return null;
    }
    if (
        !(
            (value.activeId === null || typeof value.activeId === 'string') &&
            Array.isArray(value.tabs) &&
            value.tabs.every(isBrowserTab)
        )
    ) {
        return null;
    }
    if (value.activeId !== null && !value.tabs.some((tab) => tab.id === value.activeId)) {
        return null;
    }
    return { activeId: value.activeId, tabs: value.tabs };
}

function isBrowserTab(value: unknown): value is BrowserTab {
    return Boolean(
        value &&
            typeof value === 'object' &&
            'id' in value &&
            typeof value.id === 'string' &&
            'url' in value &&
            typeof value.url === 'string' &&
            'title' in value &&
            typeof value.title === 'string' &&
            'loading' in value &&
            typeof value.loading === 'boolean' &&
            'error' in value &&
            (value.error === null || typeof value.error === 'string') &&
            'canGoBack' in value &&
            typeof value.canGoBack === 'boolean' &&
            'canGoForward' in value &&
            typeof value.canGoForward === 'boolean'
    );
}
