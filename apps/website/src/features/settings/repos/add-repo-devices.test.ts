import { expect, test } from 'bun:test';
import { addableDevices, defaultDeviceId, deviceReachNotice } from './add-repo-devices.ts';

function computer(input: {
    attachedByCurrentUser?: boolean;
    grants?: number;
    health?: string;
    id: string;
    name: string;
    workersEnabled?: boolean;
}) {
    return {
        agentAccessGrants: Array.from({ length: input.grants ?? 0 }, (_, index) => ({
            agentId: `agt_${index}`,
            grantedAt: new Date(),
            grantedByUserId: 'usr_ada',
        })),
        attachedByCurrentUser: input.attachedByCurrentUser ?? true,
        health: input.health ?? 'healthy',
        id: input.id,
        name: input.name,
        operatingSystem: 'darwin',
        workersEnabled: input.workersEnabled ?? true,
    } as never;
}

test('only Devices the viewer attached can take a folder', () => {
    const devices = addableDevices([
        computer({ id: 'cmp_mine', name: 'MacBook Pro' }),
        computer({ attachedByCurrentUser: false, id: 'cmp_theirs', name: 'Mac mini' }),
        computer({ health: 'offline', id: 'cmp_off', name: 'Studio' }),
    ]);

    expect(devices).toEqual([
        { id: 'cmp_mine', isOnline: true, name: 'MacBook Pro' },
        { id: 'cmp_off', isOnline: false, name: 'Studio' },
    ]);
});

test('the add flow starts on this Mac, else the first online Device', () => {
    const devices = [
        { id: 'cmp_off', isOnline: false, name: 'Studio' },
        { id: 'cmp_mini', isOnline: true, name: 'Mac mini' },
        { id: 'cmp_mbp', isOnline: true, name: 'MacBook Pro' },
    ];

    expect(defaultDeviceId(devices, 'cmp_mbp')).toBe('cmp_mbp');
    expect(defaultDeviceId(devices, null)).toBe('cmp_mini');
    expect(defaultDeviceId(devices, 'cmp_elsewhere')).toBe('cmp_mini');
    expect(defaultDeviceId([devices[0] as never], null)).toBe('cmp_off');
    expect(defaultDeviceId([], 'cmp_mbp')).toBeNull();
});

test('after an add, one line says when no Captain reaches the Device or Workers are off', () => {
    const lonely = computer({ id: 'cmp_1', name: 'MacBook Pro', workersEnabled: false });

    expect(deviceReachNotice(lonely, [])).toBe(
        'No Captains can reach MacBook Pro, and Workers are off there.'
    );
    expect(deviceReachNotice(computer({ id: 'cmp_1', name: 'MacBook Pro' }), [])).toBe(
        'No Captains can reach MacBook Pro yet.'
    );
    expect(deviceReachNotice(lonely, [{ computerId: 'cmp_1' }])).toBe(
        'Workers are off on MacBook Pro.'
    );
    expect(
        deviceReachNotice(computer({ grants: 1, id: 'cmp_1', name: 'MacBook Pro' }), [])
    ).toBeNull();
});
