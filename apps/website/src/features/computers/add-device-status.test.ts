import { describe, expect, test } from 'bun:test';
import type { ComputerInventory } from '@haus/api';
import { type AddedDevice, addDeviceStatus } from './add-device-status.ts';

const known = new Set(['cmp_old']);

describe('addDeviceStatus', () => {
    test('waits until a device the dialog has not seen connects', () => {
        expect(addDeviceStatus(known, [device({ id: 'cmp_old' })], 'haus-hq')).toEqual({
            kind: 'waiting',
        });
    });

    test('detects runtimes, then reports the device ready', () => {
        expect(addDeviceStatus(known, [device({ reportedInventory: null })], 'haus-hq')).toEqual({
            kind: 'detecting',
        });
        expect(addDeviceStatus(known, [device({})], 'haus-hq')).toEqual({
            kind: 'ready',
            runtimeCount: 1,
        });
    });

    test('asks for a sign-in when no runtime has a model', () => {
        expect(
            addDeviceStatus(known, [device({ reportedInventory: inventory([]) })], 'haus-hq')
        ).toMatchObject({ command: null, kind: 'repair', title: 'No Captain runtime yet' });
    });

    test('asks for an update when the device is too old or its report is unreadable', () => {
        for (const entry of [
            device({ health: 'update-required' }),
            device({ inventoryInvalidAt: '2026-11-20T00:00:00Z' }),
        ]) {
            expect(addDeviceStatus(known, [entry], 'haus-hq')).toMatchObject({
                command: 'haus-computer upgrade',
                title: 'Update needed',
            });
        }
    });

    test('tells a disconnected device to run setup again for this Server', () => {
        expect(addDeviceStatus(known, [device({ health: 'offline' })], 'haus-hq')).toMatchObject({
            command: 'haus-computer setup /haus-hq',
            title: 'Device disconnected',
        });
    });

    test('follows the newest new device', () => {
        expect(
            addDeviceStatus(
                known,
                [
                    device({ createdAt: '2026-11-20T00:00:00Z', health: 'offline', id: 'cmp_a' }),
                    device({ createdAt: '2026-11-20T00:01:00Z', id: 'cmp_b' }),
                ],
                'haus-hq'
            )
        ).toEqual({ kind: 'ready', runtimeCount: 1 });
    });
});

function device(overrides: Partial<AddedDevice>) {
    return {
        createdAt: '2026-11-20T00:00:00Z',
        health: 'healthy',
        id: 'cmp_new',
        inventoryInvalidAt: null,
        reportedInventory: inventory([{ id: 'gpt-5.6-terra' }]),
        ...overrides,
    } satisfies AddedDevice;
}

function inventory(models: { id: string }[]) {
    return {
        runtimes: [{ id: 'codex', models }],
    } as unknown as ComputerInventory;
}
