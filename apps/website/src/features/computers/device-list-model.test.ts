import { expect, test } from 'bun:test';
import { ComputerIcon, LaptopIcon } from '@hugeicons-pro/core-stroke-rounded';
import { deviceGroups, deviceIssue, deviceLastSeen, deviceMark } from './device-list-model.ts';

const now = Date.parse('2026-11-23T12:00:00Z');
const readiness = {
    accessibility: 'granted',
    installed: true,
    macosVersion: '27.3',
    screenRecording: 'granted',
    version: '1.3.1',
} as const;

function device(overrides: Partial<Parameters<typeof deviceLastSeen>[0]> = {}) {
    return {
        attachedByCurrentUser: true,
        computerUseEnabled: false,
        health: 'healthy' as const,
        lastConnectedAt: '2026-11-23T11:00:00Z',
        name: 'Zach’s MacBook Pro',
        reportedInventory: null,
        ...overrides,
    };
}

test('a healthy device is quiet; any other health is an issue to show', () => {
    expect(deviceIssue(device())).toBeNull();
    expect(deviceLastSeen(device(), now)).toBeNull();
    expect(deviceIssue(device({ health: 'update-required' }))).toEqual({
        color: 'warning',
        label: 'Update required',
    });
    expect(deviceIssue(device({ health: 'degraded' }))).toEqual({
        color: 'warning',
        label: 'Needs attention',
    });
    expect(deviceIssue(device({ health: 'offline' }))).toEqual({
        color: 'default',
        label: 'Offline',
    });
});

test('a Mac with computer use on and a permission macOS has not given needs attention', () => {
    const denied = { computerUse: { ...readiness, screenRecording: 'denied' as const } };
    expect(deviceIssue(device({ computerUseEnabled: true, reportedInventory: denied }))).toEqual({
        color: 'warning',
        label: 'Needs attention',
    });
    expect(
        deviceIssue(device({ computerUseEnabled: false, reportedInventory: denied }))
    ).toBeNull();
    expect(
        deviceIssue(
            device({ computerUseEnabled: true, reportedInventory: { computerUse: readiness } })
        )
    ).toBeNull();
    expect(
        deviceIssue(
            device({ computerUseEnabled: true, health: 'offline', reportedInventory: denied })
        )
    ).toEqual({ color: 'default', label: 'Offline' });
});

test('an offline device says when it was last seen', () => {
    expect(deviceLastSeen(device({ health: 'offline' }), now)).toBe('Last seen 1h ago');
    expect(deviceLastSeen(device({ health: 'offline', lastConnectedAt: null }), now)).toBe(
        'Never connected'
    );
});

test('devices split into the viewer’s own and everyone else’s', () => {
    const mine = device();
    const theirs = device({ attachedByCurrentUser: false, name: 'Mac mini' });
    expect(deviceGroups([theirs, mine])).toEqual({ others: [theirs], yours: [mine] });
});

test('a MacBook takes the laptop mark and anything else the desktop mark', () => {
    expect(deviceMark({ name: 'Zach’s MacBook Pro' })).toBe(LaptopIcon);
    expect(deviceMark({ name: 'Zach’s Mac mini' })).toBe(ComputerIcon);
    expect(deviceMark({ name: null })).toBe(ComputerIcon);
});
