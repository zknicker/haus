import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    computerAppExecutable,
    developmentComputerBundleId,
    releaseComputerBundleId,
    writeComputerAppBundle,
} from './computer-app-bundle.mjs';

const plistValue = (plistPath, key) =>
    spawnSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plistPath], {
        encoding: 'utf8',
    }).stdout.trim();

test(
    'the release bundle is a menu-bar-less Haus Computer app with the App icon',
    { skip: process.platform !== 'darwin' },
    async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'haus-computer-bundle-'));
        const appPath = path.join(root, 'Haus Computer.app');
        try {
            const executable = await writeComputerAppBundle(appPath, {
                bundleId: releaseComputerBundleId,
                version: '24.0.0',
            });
            const plist = path.join(appPath, 'Contents', 'Info.plist');
            expect(executable).toBe(computerAppExecutable(appPath));
            expect(plistValue(plist, 'CFBundleIdentifier')).toBe('chat.haus.computer');
            expect(plistValue(plist, 'CFBundleName')).toBe('Haus Computer');
            expect(plistValue(plist, 'CFBundleExecutable')).toBe('haus-computer');
            expect(plistValue(plist, 'CFBundleShortVersionString')).toBe('24.0.0');
            expect(plistValue(plist, 'LSUIElement')).toBe('true');
            expect(
                await readFile(path.join(appPath, 'Contents', 'Resources', 'AppIcon.icns'))
            ).toEqual(
                await readFile(
                    new URL('../../apps/website/electron/icons/AppIcon.icns', import.meta.url)
                )
            );
        } finally {
            await rm(root, { force: true, recursive: true });
        }
    }
);

test(
    'a development bundle has its own identity so it never shares the release grant',
    { skip: process.platform !== 'darwin' },
    async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'haus-computer-bundle-'));
        const appPath = path.join(root, 'Haus Computer.app');
        try {
            await writeComputerAppBundle(appPath, {
                bundleId: developmentComputerBundleId,
                version: '24.0.0',
            });
            const plist = path.join(appPath, 'Contents', 'Info.plist');
            expect(plistValue(plist, 'CFBundleIdentifier')).toBe('chat.haus.computer.dev');
            expect(plistValue(plist, 'CFBundleName')).toBe('Haus Computer Dev');
        } finally {
            await rm(root, { force: true, recursive: true });
        }
    }
);
