'use strict';

const { existsSync } = require('node:fs');
const path = require('node:path');

/** Color themes pick the live Dock icon. Mirrors `AppIcon` in `src/lib/color-themes.ts`. */
const appIcons = ['ghost', 'pumpkin', 'santa'];
const packagedIconsDirectory = 'app-icons';
/** The compiled Dock PNG for every theme icon other than the bundle's own ghost. */
const themeIconFiles = { pumpkin: 'AppIcon-pumpkin.png', santa: 'AppIcon-santa.png' };

function isAppIcon(value) {
    return appIcons.includes(value);
}

/**
 * The one owner of the running App's Dock icon on macOS. A packaged ghost is the bundle icon,
 * restored by `setIcon(null)` (AppKit's `setApplicationIconImage:nil`). Development builds have
 * no Haus bundle, so the ghost there is the compiled `AppIcon.png` when it exists.
 */
function createDockAppIcon({
    app,
    electronDirectory = __dirname,
    fileExists = existsSync,
    nativeImage = require('electron').nativeImage,
    platform = process.platform,
    resourcesPath = process.resourcesPath,
}) {
    const developmentGhostPath = path.join(electronDirectory, 'icons', 'AppIcon.png');
    const themeIconDirectory = app.isPackaged
        ? path.join(resourcesPath, packagedIconsDirectory)
        : path.join(electronDirectory, 'icons');
    const iconPaths = {
        ghost: app.isPackaged || !fileExists(developmentGhostPath) ? null : developmentGhostPath,
        ...Object.fromEntries(
            Object.entries(themeIconFiles).map(([icon, file]) => [
                icon,
                path.join(themeIconDirectory, file),
            ])
        ),
    };

    /** Startup: packaged builds already show the bundle icon; development builds need the ghost. */
    function install() {
        if (!app.isPackaged) {
            set('ghost');
        }
    }

    function set(icon) {
        if (!isAppIcon(icon)) {
            throw new TypeError(`Unknown app icon: ${String(icon)}`);
        }
        if (platform !== 'darwin' || !app.dock) {
            return;
        }
        const iconPath = iconPaths[icon];
        if (iconPath === null) {
            app.dock.setIcon(null);
            return;
        }
        if (!fileExists(iconPath)) {
            throw new Error(`Missing Dock icon ${iconPath}; run bun run build:desktop:icons`);
        }
        app.dock.setIcon(nativeImage.createFromPath(iconPath));
    }

    return { install, set };
}

module.exports = { createDockAppIcon, isAppIcon, packagedIconsDirectory, themeIconFiles };
