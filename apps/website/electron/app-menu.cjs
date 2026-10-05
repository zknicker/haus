'use strict';

const { tabMenuItems, windowMenu, zoomMenuItems } = require('./browser-menu-items.cjs');

/**
 * The App menu bar. Its Tab and View items follow the focused window's state,
 * which that window's renderer reports (`desktop:menu:state`, partial reports
 * merge): the template is rebuilt whenever the focused window or its state
 * changes. A window that never reported (still booting, signed out) gets its
 * Tab items disabled and no sidebar toggle.
 *
 * `actions`: `run(action)` (a shared window action, browser-window-actions.cjs),
 * `history(direction)`, `newWindow()`, `openSettings()`, `openDevtools()`,
 * `toggleDevMode()`, `toggleSidebar()`, `openWebsite()`.
 */
function installAppMenu({ app, BrowserWindow, Menu, actions, platform = process.platform }) {
    const states = new WeakMap();
    let installed = null;
    const install = () => {
        const window = BrowserWindow.getFocusedWindow();
        const state = (window && states.get(window)) ?? {};
        const key = JSON.stringify(state);
        if (installed === key) {
            return;
        }
        installed = key;
        const template = appMenuTemplate({ actions, appName: app.name, platform, state });
        Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    };
    app.on('browser-window-focus', install);
    install();
    return {
        /** A renderer's report for its window; invalid reports throw. */
        report(window, value) {
            if (!isMenuState(value)) {
                throw new Error('Invalid menu state.');
            }
            const { sidebarOpen, tabs } = value;
            states.set(window, {
                ...states.get(window),
                ...(sidebarOpen === undefined ? {} : { sidebarOpen }),
                ...(tabs
                    ? { tabs: Object.fromEntries(tabFlags.map((flag) => [flag, tabs[flag]])) }
                    : {}),
            });
            install();
        },
    };
}

function appMenuTemplate({ actions, appName, platform, state }) {
    const mac = platform === 'darwin';
    return [
        ...(mac ? [appNameMenu(appName, actions)] : []),
        {
            label: 'File',
            submenu: [
                { accelerator: 'CmdOrCtrl+N', click: actions.newWindow, label: 'New Window' },
                ...tabMenuItems(actions.run),
            ],
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' },
                // Finds in the focused web page; otherwise opens Search.
                { accelerator: 'CmdOrCtrl+F', click: () => actions.run('find'), label: 'Find…' },
            ],
        },
        { label: 'View', submenu: viewMenuItems(actions, state, platform) },
        {
            label: 'Go',
            submenu: [
                {
                    accelerator: 'CmdOrCtrl+[',
                    click: () => actions.history('back'),
                    label: 'Back',
                },
                {
                    accelerator: 'CmdOrCtrl+]',
                    click: () => actions.history('forward'),
                    label: 'Forward',
                },
            ],
        },
        { label: 'Tab', submenu: tabCommandItems(actions.run, state.tabs) },
        windowMenu(platform),
        {
            label: 'Developer',
            submenu: [
                {
                    accelerator: 'CmdOrCtrl+Alt+I',
                    click: actions.openDevtools,
                    id: 'open-devtools',
                    label: 'Open Web Inspector',
                },
                {
                    accelerator: 'CmdOrCtrl+Alt+D',
                    click: actions.toggleDevMode,
                    id: 'toggle-dev-mode',
                    label: 'Toggle Dev Mode',
                },
            ],
        },
        { role: 'help', submenu: [{ click: actions.openWebsite, label: 'Haus Website' }] },
    ];
}

/**
 * Chrome's Tab menu, acting on the focused pane's current tab or selection.
 * Control-Tab and Command-Shift-[ / ] also cycle tabs; they stay with the
 * renderer and pages (browser-shortcuts.cjs), so only Command-Option-arrows
 * are the menu's own keys.
 */
function tabCommandItems(run, tabs) {
    const item = (label, action, enabled, accelerator) => ({
        ...(accelerator ? { accelerator } : {}),
        click: () => run(action),
        enabled: tabs?.[enabled] === true,
        label,
    });
    return [
        item('Select Next Tab', 'next-tab', 'selectOther', 'Alt+CmdOrCtrl+Right'),
        item('Select Previous Tab', 'previous-tab', 'selectOther', 'Alt+CmdOrCtrl+Left'),
        { type: 'separator' },
        item('Duplicate Tab', 'duplicate-tab', 'duplicate'),
        item('Move Tab to New Window', 'move-tab-to-new-window', 'moveToNewWindow'),
        item('Move Tab to Other Pane', 'move-tab-to-other-pane', 'moveToOtherPane'),
    ];
}

function viewMenuItems(actions, state, platform) {
    return [
        // The focused web page reloads; an App page refetches its data.
        { accelerator: 'CmdOrCtrl+R', click: () => actions.run('reload'), label: 'Reload Page' },
        {
            accelerator: platform === 'darwin' ? 'Ctrl+Cmd+S' : 'Ctrl+Shift+S',
            click: actions.toggleSidebar,
            enabled: state.sidebarOpen !== undefined,
            label: state.sidebarOpen === false ? 'Show Sidebar' : 'Hide Sidebar',
        },
        { type: 'separator' },
        ...zoomMenuItems(actions.run),
        { type: 'separator' },
        { role: 'togglefullscreen' },
    ];
}

function appNameMenu(appName, actions) {
    return {
        label: appName,
        submenu: [
            { role: 'about' },
            { type: 'separator' },
            { accelerator: 'CmdOrCtrl+,', click: actions.openSettings, label: 'Settings…' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
        ],
    };
}

const tabFlags = ['duplicate', 'moveToNewWindow', 'moveToOtherPane', 'selectOther'];

function isMenuState(value) {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const { sidebarOpen, tabs } = value;
    const tabsValid =
        tabs === undefined ||
        (typeof tabs === 'object' &&
            tabs !== null &&
            tabFlags.every((flag) => typeof tabs[flag] === 'boolean'));
    return tabsValid && (sidebarOpen === undefined || typeof sidebarOpen === 'boolean');
}

module.exports = { appMenuTemplate, installAppMenu, isMenuState };
