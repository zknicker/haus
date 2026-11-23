import { expect, test } from 'bun:test';
import {
    computerUseNeedsGrant,
    computerUsePermissions,
    supportsComputerUse,
} from './computer-use-model.ts';

const ready = {
    accessibility: 'granted',
    installed: true,
    macosVersion: '27.3',
    screenRecording: 'granted',
    version: '1.3.1',
} as const;

test('a ready Device needs nothing, and an older Computer that reports no readiness has no rows', () => {
    expect(computerUseNeedsGrant(ready)).toBe(false);
    expect(computerUsePermissions(undefined)).toEqual([]);
    expect(computerUsePermissions({ ...ready, installed: false })).toEqual([]);
});

test('macOS 27.3 names System & App Protection Override and its Override System Protections steps', () => {
    const [accessibility, screen] = computerUsePermissions({ ...ready, accessibility: 'denied' });
    expect(accessibility).toMatchObject({
        pane: 'System & App Protection Override',
        settingsUrl:
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
        state: 'denied',
        steps: 'Click +, choose Override System Protections, then Choose Apps. Pick Haus Computer and choose Control Your Entire Mac and All Apps.',
    });
    expect(screen).toMatchObject({
        pane: 'Screen & System Audio Recording',
        settingsUrl:
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
        state: 'granted',
    });
    expect(computerUseNeedsGrant({ ...ready, accessibility: 'denied' })).toBe(true);
});

test('pane names follow the macOS version', () => {
    const panes = (macosVersion: string | undefined) =>
        computerUsePermissions({ ...ready, macosVersion }).map((permission) => permission.pane);
    expect(panes('27.1')).toEqual([
        'Device Control and Data Access',
        'Screen & System Audio Recording',
    ]);
    expect(panes('26.4')).toEqual(['Accessibility', 'Screen & System Audio Recording']);
    expect(panes('14.6')).toEqual(['Accessibility', 'Screen Recording']);
    expect(panes(undefined)).toEqual(['Accessibility', 'Screen Recording']);
});

test('computer use is offered only on macOS', () => {
    expect(supportsComputerUse({ operatingSystem: 'darwin' })).toBe(true);
    expect(supportsComputerUse({ operatingSystem: 'linux' })).toBe(false);
});
