import { describe, expect, test } from 'bun:test';
import {
    canCheckForDesktopUpdate,
    isPersistentUpdateStatus,
    readDesktopInstalledVersion,
    reconcileDesktopUpdateStatus,
} from './use-desktop-update.ts';

describe('desktop update status', () => {
    test('keeps the target version while download progress arrives', () => {
        expect(
            reconcileDesktopUpdateStatus(
                { phase: 'downloading', progress: 0, version: '1.6.1' },
                { phase: 'downloading', progress: 0.4, version: '1.6.0' }
            )
        ).toEqual({
            phase: 'downloading',
            progress: 0.4,
            version: '1.6.1',
        });
    });

    test('accepts the downloaded update version', () => {
        expect(
            reconcileDesktopUpdateStatus(
                { phase: 'downloading', progress: 0.9, version: '1.6.1' },
                { phase: 'ready', version: '1.6.1' }
            )
        ).toEqual({ phase: 'ready', version: '1.6.1' });
    });

    test('keeps every actionable update state stable across window checks', () => {
        expect(isPersistentUpdateStatus({ phase: 'available', version: '1.6.1' })).toBe(true);
        expect(
            isPersistentUpdateStatus({ phase: 'downloading', progress: 0.4, version: '1.6.1' })
        ).toBe(true);
        expect(isPersistentUpdateStatus({ phase: 'ready', version: '1.6.1' })).toBe(true);
        expect(isPersistentUpdateStatus({ phase: 'restarting', version: '1.6.1' })).toBe(true);
        expect(isPersistentUpdateStatus({ phase: 'current' })).toBe(false);
    });

    test('offers explicit checks only when they can perform work', () => {
        expect(canCheckForDesktopUpdate({ phase: 'idle' })).toBe(true);
        expect(canCheckForDesktopUpdate({ phase: 'current' })).toBe(true);
        expect(canCheckForDesktopUpdate({ message: 'Offline', phase: 'error' })).toBe(true);
        expect(canCheckForDesktopUpdate({ phase: 'available', version: '1.6.1' })).toBe(false);
        expect(canCheckForDesktopUpdate({ phase: 'ready', version: '1.6.1' })).toBe(false);
        expect(canCheckForDesktopUpdate({ phase: 'unsupported' })).toBe(false);
    });

    test('reads the installed shell version through the desktop bridge', async () => {
        await expect(
            readDesktopInstalledVersion({
                getInfo: async () => ({
                    isPackaged: true,
                    platform: 'darwin',
                    version: '1.8.40',
                }),
            })
        ).resolves.toBe('1.8.40');
        await expect(readDesktopInstalledVersion(null)).resolves.toBeNull();
    });
});
