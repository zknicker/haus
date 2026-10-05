export interface BrowserTab {
    canGoBack: boolean;
    canGoForward: boolean;
    error: string | null;
    /** The page's announced icon: an http(s) or inline image URL, or null until one arrives. */
    faviconUrl: string | null;
    /** The live find-in-page session's matches, or null while none runs. */
    find: BrowserFindResult | null;
    /** The App-chosen view id (`open` with `viewId`), named in `TabLocation`. */
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
/** Every live web view in the window. Views carry no selection: the App's tabs own it. */
export interface BrowserWorkspaceState {
    tabs: BrowserTab[];
}
export type BrowserCommand =
    | { kind: 'mount' }
    /**
     * With `viewId` (ADR 0039): ensure the App-named view exists, loading `url` only when
     * it is created, so a remounted or reopened tab restores by URL. Without one, Electron
     * asks the App for a new tab (`onBrowserOpenRequest`) instead.
     */
    | { kind: 'open'; url: string; viewId?: string }
    /** Destroys the view; a history entry still naming it reopens by URL. */
    | { kind: 'close'; id: string }
    | { kind: 'reset' }
    /** `id` names the view; without it, the focused placed view. */
    | { kind: 'navigate'; action: BrowserPageAction; id?: string }
    | { kind: 'navigate'; action: 'url'; id?: string; url: string }
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
/**
 * ADR 0039: every web view on screen at once (at most one per pane), placed by
 * the App. Views not listed hide; `focused` takes page shortcuts and key focus.
 */
export interface BrowserViewPlacement {
    bounds: BrowserBounds;
    focused: boolean;
    viewId: string;
}
/** An inline PNG or JPEG of a page, shown in place of its native view under DOM overlays. */
export type BrowserCapture = `data:image/${'jpeg' | 'png'};base64,${string}`;

export function parseBrowserCapture(value: unknown): BrowserCapture | null {
    return typeof value === 'string' && capturePattern.test(value)
        ? (value as BrowserCapture)
        : null;
}

export function parseBrowserWorkspace(value: unknown): BrowserWorkspaceState | null {
    if (!value || typeof value !== 'object' || !('tabs' in value)) {
        return null;
    }
    return Array.isArray(value.tabs) && value.tabs.every(isBrowserTab)
        ? { tabs: value.tabs }
        : null;
}

/**
 * A web page's link or popup (`openerId`: its view) or an App-window web link (`openerId`:
 * null) asking for a new tab. `background` is Chrome's background-tab disposition (a ⌘- or
 * middle-click) or Open Link in New Tab; anything else opens the tab selected.
 */
export interface BrowserOpenRequest {
    background: boolean;
    openerId: string | null;
    url: string;
}

export function parseBrowserOpenRequest(value: unknown): BrowserOpenRequest | null {
    if (
        !(
            value &&
            typeof value === 'object' &&
            'url' in value &&
            typeof value.url === 'string' &&
            /^https?:\/\//i.test(value.url) &&
            'openerId' in value &&
            (value.openerId === null || typeof value.openerId === 'string') &&
            'background' in value &&
            typeof value.background === 'boolean'
        )
    ) {
        return null;
    }
    return { background: value.background, openerId: value.openerId, url: value.url };
}

/** A fresh App-side view name for a new web tab's `TabLocation`. */
export function newBrowserViewId(): string {
    return crypto.randomUUID();
}

const coverListeners = new Set<() => void>();
let coverCount = 0;

/**
 * Hides every placed web view in the window behind its still snapshot until the returned
 * release runs (idempotent). Native views paint above DOM and swallow pointer events, so a tab
 * drag over a web page calls this on drag start and releases on drop, cancel, or unmount.
 */
export function coverBrowserViews(): () => void {
    coverCount += 1;
    notifyCovers();
    let released = false;
    return () => {
        if (!released) {
            released = true;
            coverCount -= 1;
            notifyCovers();
        }
    };
}

export function browserViewsCovered(): boolean {
    return coverCount > 0;
}

export function subscribeBrowserViewCovers(listener: () => void): () => void {
    coverListeners.add(listener);
    return () => coverListeners.delete(listener);
}

function notifyCovers() {
    for (const listener of coverListeners) {
        listener();
    }
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
