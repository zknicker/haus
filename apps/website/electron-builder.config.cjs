'use strict';

const { existsSync } = require('node:fs');
const path = require('node:path');
const { assetCatalogPath, macAppIconConfiguration } = require('./electron/mac-app-icon-config.cjs');
const { desktopRuntimeDependencies } = require('./electron/runtime-dependencies.cjs');

const releaseBaseUrl = process.env.HAUS_RELEASE_BASE_URL?.replace(/\/+$/u, '');
const macAppIcon = macAppIconConfiguration(existsSync(path.join(__dirname, assetCatalogPath)));

module.exports = {
    appId: 'chat.haus.desktop',
    productName: 'Haus',
    protocols: [
        {
            name: 'Haus',
            schemes: ['haus'],
        },
    ],
    directories: {
        output: 'electron-dist',
    },
    files: [
        'electron/browser-workspace.cjs',
        'electron/browser-capture.cjs',
        'electron/browser-favicon.cjs',
        'electron/browser-menu-items.cjs',
        'electron/browser-page-actions.cjs',
        'electron/browser-page-links.cjs',
        'electron/browser-page-menu.cjs',
        'electron/browser-shortcuts.cjs',
        'electron/browser-tab-state.cjs',
        'electron/browser-url.cjs',
        'electron/browser-workspace-ipc.cjs',
        'electron/browser-workspace-layout.cjs',
        'electron/browser-workspace-view.cjs',
        'electron/browser-window-actions.cjs',
        'electron/clerk-auth.cjs',
        'electron/clerk-auth-origins.cjs',
        'electron/clerk-loopback-callback.cjs',
        'electron/clerk-session-handoff.cjs',
        'electron/clerk-native-requests.cjs',
        'electron/edit-context-menu.cjs',
        'electron/development-dock-icon.cjs',
        'electron/dev-ports.cjs',
        'electron/external-link-handlers.cjs',
        'electron/main.cjs',
        'electron/preload.cjs',
        'electron/query-cache-handoff.cjs',
        'electron/tab-drag-geometry.cjs',
        'electron/tab-drag-ipc.cjs',
        'electron/tab-drag-reports.cjs',
        'electron/tab-drag-session.cjs',
        'electron/trusted-renderer.cjs',
        'electron/window-ipc.cjs',
        'electron/window-lifecycle.cjs',
        'electron/window-routing.cjs',
        'electron/window-signals.cjs',
        'electron/window-stack.cjs',
        'electron/window-state.cjs',
        'package.json',
        '!node_modules/**',
        `node_modules/{${desktopRuntimeDependencies.join(',')}}/**`,
    ],
    extraResources: macAppIcon.extraResources,
    mac: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder artifact macros are literal strings.
        artifactName: '${productName}_${version}_${arch}.${ext}',
        category: 'public.app-category.productivity',
        darkModeSupport: true,
        entitlements: 'electron/Entitlements.plist',
        entitlementsInherit: 'electron/Entitlements.plist',
        extendInfo: macAppIcon.extendInfo,
        gatekeeperAssess: false,
        hardenedRuntime: true,
        icon: 'electron/icons/AppIcon.icns',
        notarize: process.env.HAUS_ELECTRON_NOTARIZE !== '0',
        target: ['dmg', 'zip'],
    },
    publish: releaseBaseUrl
        ? [
              {
                  provider: 'generic',
                  url: releaseBaseUrl,
              },
          ]
        : null,
};
