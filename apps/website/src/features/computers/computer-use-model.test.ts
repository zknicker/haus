import { expect, test } from 'bun:test';
import {
    computerUseNeedsGrant,
    computerUsePermissions,
    missingComputerUsePermission,
    supportsComputerUse,
    wrongMacLine,
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

test('the first permission macOS has not given is the one to fix; one it could not check is not', () => {
    expect(missingComputerUsePermission(ready)).toBeUndefined();
    expect(missingComputerUsePermission({ ...ready, screenRecording: 'unknown' })).toBeUndefined();
    expect(
        missingComputerUsePermission({
            ...ready,
            accessibility: 'denied',
            screenRecording: 'denied',
        })?.id
    ).toBe('accessibility');
    expect(missingComputerUsePermission({ ...ready, screenRecording: 'denied' })?.id).toBe(
        'screen-recording'
    );
});

test('the setup steps name the Mac you are on only when the desktop App knows it is another one', () => {
    const devices = [
        { id: 'cmp_mini', name: 'Zach’s Mac mini' },
        { id: 'cmp_book', name: 'Zach’s MacBook Pro' },
    ];
    const line = (localComputerId: string | null | undefined) =>
        wrongMacLine({
            deviceName: 'Zach’s Mac mini',
            devices,
            localComputerId,
            targetId: 'cmp_mini',
        });
    expect(line('cmp_book')).toBe(
        'You’re on Zach’s MacBook Pro. Do this on Zach’s Mac mini, through Screen Sharing if it has no display.'
    );
    expect(line('cmp_mini')).toBeNull();
    expect(line(null)).toBeNull();
    expect(line(undefined)).toBeNull();
    expect(line('cmp_removed')).toBeNull();
});
