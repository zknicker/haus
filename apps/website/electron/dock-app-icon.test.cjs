'use strict';

const { describe, expect, test } = require('bun:test');
const { createDockAppIcon } = require('./dock-app-icon.cjs');
const { registerDesktopShellIpc } = require('./desktop-shell-ipc.cjs');

const appUrl = 'https://haus.chat';
const trustedEvent = { senderFrame: { url: 'https://haus.chat/s/dev' } };

function dockFixture({ fileExists = () => true, isPackaged, platform = 'darwin' }) {
    const dockIcons = [];
    const app = { dock: { setIcon: (image) => dockIcons.push(image) }, isPackaged };
    const nativeImage = { createFromPath: (iconPath) => ({ iconPath }) };
    const dockAppIcon = createDockAppIcon({
        app,
        electronDirectory: '/haus/electron',
        fileExists,
        nativeImage,
        platform,
        resourcesPath: '/Haus.app/Contents/Resources',
    });
    return { app, dockAppIcon, dockIcons };
}

function ipcFixture(options) {
    const fixture = dockFixture(options);
    const handlers = new Map();
    registerDesktopShellIpc({
        app: fixture.app,
        appUrl,
        dockAppIcon: fixture.dockAppIcon,
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
        nativeTheme: {},
    });
    return { ...fixture, setAppIcon: handlers.get('desktop:dock:set-app-icon') };
}

describe('live Dock app icon', () => {
    test('packaged pumpkin reads the Resources PNG; ghost restores the bundle icon', () => {
        const { dockIcons, setAppIcon } = ipcFixture({ isPackaged: true });

        setAppIcon(trustedEvent, 'pumpkin');
        setAppIcon(trustedEvent, 'ghost');

        expect(dockIcons).toEqual([
            { iconPath: '/Haus.app/Contents/Resources/app-icons/AppIcon-pumpkin.png' },
            null,
        ]);
    });

    test('development ghost is the compiled dev icon, so install and restore agree', () => {
        const { dockAppIcon, dockIcons, setAppIcon } = ipcFixture({ isPackaged: false });

        dockAppIcon.install();
        setAppIcon(trustedEvent, 'pumpkin');
        setAppIcon(trustedEvent, 'ghost');

        expect(dockIcons).toEqual([
            { iconPath: '/haus/electron/icons/AppIcon.png' },
            { iconPath: '/haus/electron/icons/AppIcon-pumpkin.png' },
            { iconPath: '/haus/electron/icons/AppIcon.png' },
        ]);
    });

    test('packaged startup leaves the bundle icon alone', () => {
        const { dockAppIcon, dockIcons } = dockFixture({ isPackaged: true });

        dockAppIcon.install();

        expect(dockIcons).toEqual([]);
    });

    test('a missing pumpkin build fails loudly; a missing dev ghost falls back to the default', () => {
        const { dockIcons, setAppIcon } = ipcFixture({
            fileExists: () => false,
            isPackaged: false,
        });

        expect(() => setAppIcon(trustedEvent, 'pumpkin')).toThrow('Missing Dock icon');
        setAppIcon(trustedEvent, 'ghost');

        expect(dockIcons).toEqual([null]);
    });

    test('rejects untrusted senders and unknown icons without touching the Dock', () => {
        const { dockIcons, setAppIcon } = ipcFixture({ isPackaged: true });

        expect(() =>
            setAppIcon({ senderFrame: { url: 'https://evil.example' } }, 'pumpkin')
        ).toThrow('Untrusted page');
        for (const icon of ['witch', '', null, undefined, 1, { icon: 'pumpkin' }]) {
            expect(() => setAppIcon(trustedEvent, icon)).toThrow('ghost or pumpkin');
        }

        expect(dockIcons).toEqual([]);
    });

    test('is a no-op off macOS', () => {
        const { dockIcons, setAppIcon } = ipcFixture({ isPackaged: true, platform: 'win32' });

        setAppIcon(trustedEvent, 'pumpkin');

        expect(dockIcons).toEqual([]);
    });
});
