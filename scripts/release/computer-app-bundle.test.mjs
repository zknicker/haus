import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    computerAppExecutable,
    developmentComputerBundleId,
    releaseComputerBundleId,
    writeComputerAppBundle,
} from './computer-app-bundle.mjs';

const plistValue = async (plistPath, key) => {
    const plist = await readFile(plistPath, 'utf8');
    const entry = new RegExp(`<key>${key}</key>\\s*<(string|true|false)\\s*/?>([^<]*)`, 'u').exec(
        plist
    );
    return entry?.[1] === 'string' ? entry[2] : entry?.[1];
};

test('the release bundle is a menu-bar-less Haus Computer app with the App icon', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'haus-computer-bundle-'));
    const appPath = path.join(root, 'Haus Computer.app');
    try {
        const executable = await writeComputerAppBundle(appPath, {
            bundleId: releaseComputerBundleId,
            version: '24.0.0',
        });
        const plist = path.join(appPath, 'Contents', 'Info.plist');
        expect(executable).toBe(computerAppExecutable(appPath));
        expect(await plistValue(plist, 'CFBundleIdentifier')).toBe('chat.haus.computer');
        expect(await plistValue(plist, 'CFBundleName')).toBe('Haus Computer');
        expect(await plistValue(plist, 'CFBundleExecutable')).toBe('haus-computer');
        expect(await plistValue(plist, 'CFBundleShortVersionString')).toBe('24.0.0');
        expect(await plistValue(plist, 'LSUIElement')).toBe('true');
        expect(await readFile(path.join(appPath, 'Contents', 'Resources', 'AppIcon.icns'))).toEqual(
            await readFile(new URL('../../apps/computer/assets/AppIcon.icns', import.meta.url))
        );
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

test('a development bundle has its own identity so it never shares the release grant', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'haus-computer-bundle-'));
    const appPath = path.join(root, 'Haus Computer.app');
    try {
        await writeComputerAppBundle(appPath, {
            bundleId: developmentComputerBundleId,
            version: '24.0.0',
        });
        const plist = path.join(appPath, 'Contents', 'Info.plist');
        expect(await plistValue(plist, 'CFBundleIdentifier')).toBe('chat.haus.computer.dev');
        expect(await plistValue(plist, 'CFBundleName')).toBe('Haus Computer Dev');
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});
