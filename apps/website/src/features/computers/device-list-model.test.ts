import { expect, test } from 'bun:test';
import { ComputerIcon, LaptopIcon } from '@hugeicons-pro/core-stroke-rounded';
import { deviceGroups, deviceMark, deviceStatusLine } from './device-list-model.ts';

const now = Date.parse('2026-11-23T12:00:00Z');

function device(overrides: Partial<Parameters<typeof deviceStatusLine>[0]> = {}) {
    return {
        attachedByCurrentUser: true,
        health: 'healthy' as const,
        lastConnectedAt: '2026-11-23T11:00:00Z',
        name: 'Zach’s MacBook Pro',
        ...overrides,
    };
}

test('an online device says only that it is online', () => {
    expect(deviceStatusLine(device(), now)).toBe('Online');
    expect(deviceStatusLine(device({ health: 'update-required' }), now)).toBe('Update required');
});

test('an offline device says when it was last seen', () => {
    expect(deviceStatusLine(device({ health: 'offline' }), now)).toBe('Offline · last seen 1h ago');
    expect(deviceStatusLine(device({ health: 'offline', lastConnectedAt: null }), now)).toBe(
        'Offline · never connected'
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
