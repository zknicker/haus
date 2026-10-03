'use strict';

/**
 * App menu items for workspace tabs and zoom. Each runs a shared window action
 * (browser-window-actions.cjs), the same path a focused page's keys take.
 */
function tabMenuItems(run) {
    return [
        { accelerator: 'CmdOrCtrl+T', click: () => run('new-tab'), label: 'New Tab' },
        {
            accelerator: 'CmdOrCtrl+Shift+T',
            click: () => run('reopen-tab'),
            label: 'Reopen Closed Tab',
        },
        { type: 'separator' },
        // Not role: 'close' — the renderer closes an open workspace tab first
        // and only falls back to closing the window.
        { accelerator: 'CmdOrCtrl+W', click: () => run('close-tab'), label: 'Close' },
        {
            accelerator: 'CmdOrCtrl+Shift+W',
            click: () => run('close-window'),
            label: 'Close Window',
        },
    ];
}

/**
 * The Window menu. Off macOS the stock `windowMenu` role carries its own
 * Close (Ctrl+W) that would close the window before File > Close could close
 * a tab, so it is rebuilt without one.
 */
function windowMenu(platform = process.platform) {
    return platform === 'darwin'
        ? { role: 'windowMenu' }
        : { label: 'Window', submenu: [{ role: 'minimize' }] };
}

/** Zoom the selected browser page, or the App when none is selected. */
function zoomMenuItems(run) {
    return [
        { accelerator: 'CmdOrCtrl+0', click: () => run('zoom-reset'), label: 'Actual Size' },
        { accelerator: 'CmdOrCtrl+=', click: () => run('zoom-in'), label: 'Zoom In' },
        {
            accelerator: 'CmdOrCtrl+Plus',
            click: () => run('zoom-in'),
            label: 'Zoom In',
            visible: false,
        },
        { accelerator: 'CmdOrCtrl+-', click: () => run('zoom-out'), label: 'Zoom Out' },
    ];
}

module.exports = { tabMenuItems, windowMenu, zoomMenuItems };
