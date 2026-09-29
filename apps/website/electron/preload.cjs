'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const bridge = {
    loadsApp: true,
    authTokenGet: () => ipcRenderer.invoke('desktop:auth:token-get'),
    authTokenSet: (token) => ipcRenderer.invoke('desktop:auth:token-set', token),
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
