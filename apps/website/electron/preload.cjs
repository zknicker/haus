'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { isOpenedFromWindow } = require('./window-routing.cjs');

const bridge = {
    loadsApp: true,
    skoolLogin: (viewId) => ipcRenderer.invoke('desktop:skool:login', viewId),
    openedFromWindow: isOpenedFromWindow(process.argv),
    browserCommand: (command) => ipcRenderer.invoke('desktop:browser:command', command),
    browserSnapshot: () => ipcRenderer.invoke('desktop:browser:snapshot'),
    browserCapture: (id) => ipcRenderer.invoke('desktop:browser:capture', id),
    browserLayout: (placements) => ipcRenderer.invoke('desktop:browser:layout', placements),
    onBrowserShortcut: (listener) => {
        const handler = (_event, shortcut) => listener(shortcut);
        ipcRenderer.on('desktop:browser:shortcut', handler);
        return () => ipcRenderer.off('desktop:browser:shortcut', handler);
    },
    onBrowserFocus: (listener) => {
        const handler = (_event, viewId) => listener(viewId);
        ipcRenderer.on('desktop:browser:focus', handler);
        return () => ipcRenderer.off('desktop:browser:focus', handler);
    },
    onBrowserOpenRequest: (listener) => {
        const handler = (_event, request) => listener(request);
        ipcRenderer.on('desktop:browser:open-request', handler);
        return () => ipcRenderer.off('desktop:browser:open-request', handler);
    },
    onBrowserState: (listener) => {
        const handler = (_event, state) => listener(state);
        ipcRenderer.on('desktop:browser:state', handler);
        return () => ipcRenderer.off('desktop:browser:state', handler);
    },
    tabDragClaim: (serverId) => ipcRenderer.sendSync('desktop:tab-drag:claim', serverId),
    tabDragDetach: (request) => ipcRenderer.invoke('desktop:tab-drag:detach', request),
    tabDragEnd: (outcome) => ipcRenderer.invoke('desktop:tab-drag:end', outcome),
    tabDragStart: (start) => ipcRenderer.invoke('desktop:tab-drag:start', start),
    tabMoveToNewWindow: (move) => ipcRenderer.invoke('desktop:tab:move-to-new-window', move),
    reportMenuState: (state) => ipcRenderer.invoke('desktop:menu:state', state),
    onSidebarToggle: (listener) => {
        const handler = () => listener();
        ipcRenderer.on('desktop:sidebar:toggle', handler);
        return () => ipcRenderer.off('desktop:sidebar:toggle', handler);
    },
    tabStripReport: (report) => ipcRenderer.invoke('desktop:tab-strip:report', report),
    onTabDrag: (listener) => {
        const handler = (_event, message) => listener(message);
        ipcRenderer.on('desktop:tab-drag:event', handler);
        return () => ipcRenderer.off('desktop:tab-drag:event', handler);
    },
    queryCacheClaim: () => ipcRenderer.sendSync('desktop:query-cache:claim'),
    onQueryCacheRequest: (listener) => {
        const handler = (_event, token) => {
            ipcRenderer
                .invoke('desktop:query-cache:offer', token, listener())
                .catch((error) =>
                    console.warn('[Haus] Could not hand off the query cache.', error)
                );
        };
        ipcRenderer.on('desktop:query-cache:request', handler);
        return () => ipcRenderer.off('desktop:query-cache:request', handler);
    },
    authTokenGet: () => ipcRenderer.invoke('desktop:auth:token-get'),
    authTokenSet: (token) => ipcRenderer.invoke('desktop:auth:token-set', token),
    authSessionPeek: () => ipcRenderer.sendSync('desktop:auth:session-peek'),
    authSessionShare: (token) => ipcRenderer.invoke('desktop:auth:session-share', token),
    cancelSsoCallback: () => ipcRenderer.invoke('desktop:auth:sso-callback-cancel'),
    onSsoCallback: (listener) => {
        const handler = (_event, url) => listener(url);
        ipcRenderer.on('desktop:auth:sso-callback', handler);
        return () => ipcRenderer.off('desktop:auth:sso-callback', handler);
    },
    prepareSsoCallback: () => ipcRenderer.invoke('desktop:auth:sso-callback-prepare'),
    openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
    onDevModeToggle: (listener) => {
        const handler = () => listener();
        ipcRenderer.on('desktop:dev-mode:toggle', handler);
        return () => ipcRenderer.off('desktop:dev-mode:toggle', handler);
    },
    onCloseWindowRequest: (listener) => {
        const handler = () => listener();
        ipcRenderer.on('desktop:window:close-request', handler);
        return () => ipcRenderer.off('desktop:window:close-request', handler);
    },
    onHistoryNavigate: (listener) => {
        const handler = (_event, direction) => {
            listener(direction === 'forward' ? 'forward' : 'back');
        };
        ipcRenderer.on('desktop:window:history', handler);
        return () => ipcRenderer.off('desktop:window:history', handler);
    },
    onNewTabRequest: (listener) => {
        const handler = () => listener();
        ipcRenderer.on('desktop:window:new-tab', handler);
        return () => ipcRenderer.off('desktop:window:new-tab', handler);
    },
    onOpenSearch: (listener) => {
        const handler = () => listener();
        ipcRenderer.on('desktop:search:open', handler);
        return () => ipcRenderer.off('desktop:search:open', handler);
    },
    onOpenSettings: (listener) => {
        const handler = () => listener();
        ipcRenderer.on('desktop:settings:open', handler);
        return () => ipcRenderer.off('desktop:settings:open', handler);
    },
    onWindowFocusChanged: (listener) => {
        const handler = (_event, focused) => listener(Boolean(focused));
        ipcRenderer.on('desktop:window:focus-state', handler);
        return () => ipcRenderer.off('desktop:window:focus-state', handler);
    },
    checkForUpdate: () => ipcRenderer.invoke('desktop:update:check'),
    downloadUpdate: () => ipcRenderer.invoke('desktop:update:download'),
    closeWindow: () => ipcRenderer.invoke('desktop:window:close'),
    focusWindow: () => ipcRenderer.invoke('desktop:window:focus'),
    getInfo: () => ipcRenderer.invoke('desktop:get-info'),
    openWindow: (route) => ipcRenderer.invoke('desktop:window:open', route),
    onUpdateStatus: (listener) => {
        const handler = (_event, status) => listener(status);
        ipcRenderer.on('desktop:update:status', handler);
        return () => ipcRenderer.off('desktop:update:status', handler);
    },
    restartForUpdate: () => ipcRenderer.invoke('desktop:update:restart'),
    runEditCommand: (command) => ipcRenderer.invoke('desktop:edit:run', command),
    setDockBadge: (count) => ipcRenderer.invoke('desktop:dock:set-badge', count),
    setTheme: (theme) => ipcRenderer.invoke('desktop:window:set-theme', theme),
    startWindowDrag: () => ipcRenderer.invoke('desktop:window:start-drag'),
};

contextBridge.exposeInMainWorld('hausDesktop', bridge);
