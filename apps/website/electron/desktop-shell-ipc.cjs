'use strict';

const { isAppIcon } = require('./dock-app-icon.cjs');
const { assertTrustedRenderer } = require('./trusted-renderer.cjs');

/** Small app-wide shell facts and controls: build info, the Dock badge and icon, and the window theme. */
function registerDesktopShellIpc({ app, appUrl, dockAppIcon, ipcMain, nativeTheme }) {
    ipcMain.handle('desktop:get-info', (event) => {
        assertTrustedRenderer(event, appUrl);
        return {
            isPackaged: app.isPackaged,
            platform: process.platform,
            version: app.getVersion(),
        };
    });

    ipcMain.handle('desktop:dock:set-badge', (event, count) => {
        assertTrustedRenderer(event, appUrl);
        if (!Number.isInteger(count) || count < 0) {
            return;
        }

        app.dock?.setBadge(count > 0 ? String(count) : '');
    });

    ipcMain.handle('desktop:dock:set-app-icon', (event, icon) => {
        assertTrustedRenderer(event, appUrl);
        if (!isAppIcon(icon)) {
            throw new TypeError('App icon must be ghost or pumpkin');
        }

        dockAppIcon.set(icon);
    });

    ipcMain.handle('desktop:window:set-theme', (event, theme) => {
        assertTrustedRenderer(event, appUrl);
        nativeTheme.themeSource = theme === 'dark' || theme === 'light' ? theme : 'system';
    });
}

module.exports = { registerDesktopShellIpc };
