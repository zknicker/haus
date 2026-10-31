import type { BrowserCommand, BrowserViewPlacement } from './desktop-browser.ts';
import type { TabDragDetach, TabDragStart, TabStripReport } from './desktop-tab-drag.ts';

export type DesktopUpdateBridgeStatus =
    | { phase: 'unsupported' }
    | { phase: 'checking' }
    | { phase: 'current' }
    | { phase: 'available'; version: string }
    | { phase: 'downloading'; progress: number; version: string }
    | { phase: 'ready'; version: string }
    | { phase: 'restarting'; version: string }
    | { phase: 'error'; message: string };

/**
 * A window's App menu state, reported by its renderer as it changes (partial
 * reports merge): which Tab menu items apply to the focused pane's tabs, and
 * whether the sidebar shows (View > Show/Hide Sidebar's label).
 */
export interface DesktopMenuState {
    sidebarOpen?: boolean;
    tabs?: {
        duplicate: boolean;
        moveToNewWindow: boolean;
        moveToOtherPane: boolean;
        selectOther: boolean;
    };
}

export type DesktopEditCommand = 'copy' | 'cut' | 'paste' | 'redo' | 'selectAll' | 'undo';

export interface HausDesktopBridge {
    authCancelSignIn?: () => Promise<void>;
    /** Ask main to restore the signed-in Haus session from its protected credential store. */
    authInitialize?: () => Promise<unknown>;
    /** Ask the single main-process auth manager to refresh and return the current AppSession. */
    authRefresh?: () => Promise<unknown>;
    /** The main process's short-lived Haus session, while it has time left; synchronous. */
    authSessionPeek?: () => unknown;
    authSignIn?: (options?: { switchAccount?: boolean }) => Promise<void>;
    authSignOut?: () => Promise<void>;
    /** Captures a placed web view as an inline image; validate with `parseBrowserCapture`. */
    browserCapture?: (viewId: string) => Promise<unknown>;
    browserCommand?: (command: BrowserCommand) => Promise<unknown>;
    /** ADR 0039: places every visible web view in one call; views not listed hide. */
    browserLayout?: (placements: readonly BrowserViewPlacement[]) => Promise<void>;
    browserSnapshot?: () => Promise<unknown>;
    checkForUpdate: () => Promise<void>;
    closeWindow: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    /** Show, restore, and focus this window — including one hidden by closing it on macOS. */
    focusWindow?: () => Promise<void>;
    getInfo: () => Promise<{ isPackaged: boolean; platform: NodeJS.Platform; version: string }>;
    /** Electron loads the canonical Haus App instead of a bundled renderer. */
    loadsApp?: true;
    /** Main → renderer: the current AppSession, or null after sign-out. */
    onAuthSession?: (listener: (session: unknown) => void) => () => void;
    /** Main → renderer: a web page closed itself (`window.close()`); its view id (unvalidated). */
    onBrowserClosed?: (listener: (viewId: unknown) => void) => () => void;
    /** Main → renderer: a web view took key focus; its view id (unvalidated). */
    onBrowserFocus?: (listener: (viewId: unknown) => void) => () => void;
    /**
     * Main → renderer: a web page's link or popup, or an App-window web link, asks for a new
     * tab; validate with `parseBrowserOpenRequest`.
     */
    onBrowserOpenRequest?: (listener: (request: unknown) => void) => () => void;
    onBrowserShortcut?: (listener: (shortcut: string) => void) => () => void;
    onBrowserState?: (listener: (state: unknown) => void) => () => void;
    /** Main → renderer: File > Close (⌘W); close a tab first or fall back to closeWindow. */
    onCloseWindowRequest?: (listener: () => void) => () => void;
    /** Main → renderer: the Developer menu toggled dev mode for this device. */
    onDevModeToggle?: (listener: () => void) => () => void;
    /**
     * Lists one vault's items, then mints a read-only 1Password service account for it through
     * the local `op` CLI (approved in 1Password); validate with `parseOnePasswordConnectReply`.
     */
    onePasswordCreateServiceAccount?: (request: {
        account: string;
        computerName: string;
        vault: { id: string; name: string };
    }) => Promise<unknown>;
    /** Lists one vault's items (approved in 1Password); validate with `parseOnePasswordItemsReply`. */
    onePasswordItems?: (request: { account: string; vaultId: string }) => Promise<unknown>;
    /** Lists grantable 1Password vaults (approved in 1Password); validate with `parseOnePasswordVaultsReply`. */
    onePasswordVaults?: () => Promise<unknown>;
    /** Main → renderer: Go menu (⌘[ / ⌘]) or a macOS page swipe. */
    onHistoryNavigate?: (listener: (direction: 'back' | 'forward') => void) => () => void;
    /** Main → renderer: File > New Tab (⌘T); opens a tab in the active pane when one is open. */
    onNewTabRequest?: (listener: () => void) => () => void;
    /** Main → renderer: Edit > Find… (⌘F) asked this window to open Search. */
    onOpenSearch?: (listener: () => void) => () => void;
    /** Main → renderer: the app menu asked this window to open Settings (⌘,). */
    onOpenSettings?: (listener: () => void) => () => void;
    /**
     * Main → renderer: a window this one opened asks for a copy of its query cache; the
     * listener returns `packQueryCacheHandoff` output (or null) and preload offers it to main.
     */
    onQueryCacheRequest?: (listener: () => unknown) => () => void;
    /** Main → renderer: View > Show/Hide Sidebar. */
    onSidebarToggle?: (listener: () => void) => () => void;
    /** Main → renderer: `parseTabDragMessage` input. */
    onTabDrag?: (listener: (message: unknown) => void) => () => void;
    onUpdateStatus: (listener: (status: DesktopUpdateBridgeStatus) => void) => () => void;
    /** Main → renderer: this window gained or lost native focus. */
    onWindowFocusChanged?: (listener: (focused: boolean) => void) => () => void;
    /** Open an HTTP(S) URL or an allowlisted provider app deeplink through the operating system. */
    openExternal: (url: string) => Promise<void>;
    /**
     * Main opened this window from another one (⌘N, openWindow, tab tear-off); fixed for the
     * page's lifetime and readable before the first render. Only the launch window shows the ghost.
     */
    openedFromWindow?: boolean;
    openWindow: (route: string) => Promise<void>;
    /** The opener's query cache copy this window opened with, once per page load; synchronous. */
    queryCacheClaim?: () => unknown;
    /** What the App menu's Tab and View items can do for this window (`DesktopMenuState`). */
    reportMenuState?: (state: DesktopMenuState) => Promise<void>;
    restartForUpdate: () => Promise<void>;
    runEditCommand: (command: DesktopEditCommand) => Promise<void>;
    /** Show a theme's app icon in the macOS Dock; `ghost` restores the bundle icon. Older shells lack it. */
    setAppIcon?: (icon: 'ghost' | 'pumpkin') => Promise<void>;
    /** Show a count on the macOS Dock icon; 0 clears it. */
    setDockBadge?: (count: number) => Promise<void>;
    setTheme: (theme: 'dark' | 'light' | null) => Promise<void>;
    skoolLogin?: (viewId: string) => Promise<unknown>;
    /**
     * Tab drag between windows (ADR 0039, `lib/desktop-tab-drag.ts`). A torn-off window claims
     * the tabs it opened with (a `TabBundle`), synchronously, before its first render; null when
     * it has none.
     */
    tabDragClaim?: (serverId: string) => unknown;
    /** The dragged tabs left this window's band; resolves to `parseDetachReply` input. */
    tabDragDetach?: (request: TabDragDetach) => Promise<unknown>;
    /** The pressing window's gesture ended; a cancel resolves to `{ restore: bundle }` to put back, if any. */
    tabDragEnd?: (outcome: 'cancel' | 'drop') => Promise<unknown>;
    tabDragStart?: (start: TabDragStart) => Promise<void>;
    /** Tab menu Move to new window: resolves true once a new window holds the bundle's tabs. */
    tabMoveToNewWindow?: (move: TabDragStart) => Promise<unknown>;
    /** This window's band on screen, or null once it has none. */
    tabStripReport?: (report: TabStripReport | null) => Promise<void>;
}

/** The supported Haus shell exposes the same bridge as the hosted App. */
export function resolveDesktopBridge(host: Partial<Window> | undefined | null) {
    return host?.hausDesktop ?? null;
}

export function getDesktopBridge() {
    if (typeof window === 'undefined') {
        return null;
    }

    return resolveDesktopBridge(window);
}

export function isElectronDesktopApp() {
    return getDesktopBridge() !== null;
}
