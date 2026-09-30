export interface BrowserTab {
    canGoBack: boolean;
    canGoForward: boolean;
    error: string | null;
    /** The page's announced icon: an http(s) or inline image URL, or null until one arrives. */
    faviconUrl: string | null;
    /** The live find-in-page session's matches, or null while none runs. */
    find: BrowserFindResult | null;
    id: string;
    loading: boolean;
    title: string;
    url: string;
    /** Page zoom as a factor; 1 is 100%. */
    zoomFactor: number;
}
export interface BrowserFindResult {
    /** 1-based; 0 until the page reports a match. */
    activeMatch: number;
    matches: number;
}
export type BrowserPageAction =
    | 'back'
    | 'forward'
    | 'hard-reload'
    | 'reload'
    | 'stop'
    | 'zoom-in'
    | 'zoom-out'
    | 'zoom-reset';
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
    | { kind: 'navigate'; action: BrowserPageAction }
    | { kind: 'navigate'; action: 'url'; url: string }
    /** `newSession` starts a fresh search; follow-ups step to the next or previous match. */
    | { kind: 'find'; id: string; text: string; forward: boolean; newSession: boolean }
    | { kind: 'stop-find'; id: string };
export interface BrowserBounds {
    height: number;
    /** Corner radius in CSS px, matching the shell card the page sits in; omitted when square. */
    radius?: number;
    width: number;
    x: number;
    y: number;
}
/** An inline PNG or JPEG of a page, shown in place of its native view under DOM overlays. */
export type BrowserCapture = `data:image/${'jpeg' | 'png'};base64,${string}`;

export function parseBrowserCapture(value: unknown): BrowserCapture | null {
    return typeof value === 'string' && capturePattern.test(value)
        ? (value as BrowserCapture)
        : null;
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
            'faviconUrl' in value &&
            (value.faviconUrl === null || isFaviconUrl(value.faviconUrl)) &&
            'canGoBack' in value &&
            typeof value.canGoBack === 'boolean' &&
            'canGoForward' in value &&
            typeof value.canGoForward === 'boolean' &&
            'zoomFactor' in value &&
            typeof value.zoomFactor === 'number' &&
            value.zoomFactor > 0 &&
            'find' in value &&
            (value.find === null || isFindResult(value.find))
    );
}

function isFindResult(value: unknown): value is BrowserFindResult {
    return Boolean(
        value &&
            typeof value === 'object' &&
            'activeMatch' in value &&
            Number.isInteger(value.activeMatch) &&
            'matches' in value &&
            Number.isInteger(value.matches)
    );
}

const capturePattern = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isFaviconUrl(value: unknown): value is string {
    return typeof value === 'string' && /^(https?:\/\/|data:image\/)/i.test(value);
}
