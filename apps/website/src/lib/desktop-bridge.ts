export type DesktopUpdateBridgeStatus =
    | { phase: 'unsupported' }
    | { phase: 'checking' }
    | { phase: 'current' }
    | { phase: 'available'; version: string }
    | { phase: 'downloading'; progress: number; version: string }
    | { phase: 'ready'; version: string }
    | { phase: 'restarting'; version: string }
    | { phase: 'error'; message: string };

export type DesktopEditCommand = 'copy' | 'cut' | 'paste' | 'redo' | 'selectAll' | 'undo';

export interface HausDesktopBridge {
    /** Read Clerk's native client JWT from main-process storage. */
    authTokenGet: () => Promise<string | null>;
    /** Persist or clear Clerk's native client JWT in main-process storage. */
    authTokenSet: (token: string | null) => Promise<void>;
    /** Stop waiting for a development loopback OAuth callback. */
    cancelSsoCallback?: () => Promise<void>;
    checkForUpdate: () => Promise<void>;
    closeWindow: () => Promise<void>;
    downloadUpdate: () => Promise<void>;
    /** Show, restore, and focus this window — including one hidden by closing it on macOS. */
    focusWindow?: () => Promise<void>;
    getInfo: () => Promise<{ isPackaged: boolean; platform: NodeJS.Platform; version: string }>;
    /** Electron loads the canonical Haus App instead of a bundled renderer. */
    loadsApp?: true;
    /** Main → renderer: File > Close (⌘W); close a tab first or fall back to closeWindow. */
    onCloseWindowRequest?: (listener: () => void) => () => void;
    /** Main → renderer: the Developer menu toggled dev mode for this device. */
    onDevModeToggle?: (listener: () => void) => () => void;
    /** Main → renderer: Go menu (⌘[ / ⌘]) or a macOS page swipe. */
    onHistoryNavigate?: (listener: (direction: 'back' | 'forward') => void) => () => void;
    /** Main → renderer: File > New Tab (⌘T); opens a tab in the active pane when one is open. */
    onNewTabRequest?: (listener: () => void) => () => void;
    /** Main → renderer: Edit > Find… (⌘F) asked this window to open Search. */
    onOpenSearch?: (listener: () => void) => () => void;
    /** Main → renderer: the app menu asked this window to open Settings (⌘,). */
    onOpenSettings?: (listener: () => void) => () => void;
    /** Main → renderer: the system browser returned Clerk's OAuth callback. */
    onSsoCallback: (listener: (url: string) => void) => () => void;
    onUpdateStatus: (listener: (status: DesktopUpdateBridgeStatus) => void) => () => void;
    /** Main → renderer: this window gained or lost native focus. */
    onWindowFocusChanged?: (listener: (focused: boolean) => void) => () => void;
    /** Open an HTTP(S) URL in the operating system's default browser. */
    openExternal: (url: string) => Promise<void>;
    openWindow: (route: string) => Promise<void>;
    /** Reserve the callback URL owned by this desktop process. */
    prepareSsoCallback?: () => Promise<string>;
    restartForUpdate: () => Promise<void>;
    runEditCommand: (command: DesktopEditCommand) => Promise<void>;
    /** Show a count on the macOS Dock icon; 0 clears it. */
    setDockBadge?: (count: number) => Promise<void>;
    setTheme: (theme: 'dark' | 'light' | null) => Promise<void>;
    startWindowDrag: () => Promise<void>;
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
