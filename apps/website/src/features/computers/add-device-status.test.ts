import { describe, expect, test } from 'bun:test';
import type { ComputerInventory } from '@haus/api';
import { type AddedDevice, addDeviceStatus } from './add-device-status.ts';

const known = new Set(['cmp_old']);

describe('addDeviceStatus', () => {
    test('waits while the device list has not settled or no new device is here', () => {
        expect(addDeviceStatus(null, [device({})]).label).toBe('Waiting for the device…');
        expect(addDeviceStatus(known, [device({ id: 'cmp_old' })]).label).toBe(
            'Waiting for the device…'
        );
        expect(addDeviceStatus(known, [device({ attachedByCurrentUser: false })]).label).toBe(
            'Waiting for the device…'
        );
    });

    test('keeps waiting while an attached device has never connected', () => {
        expect(
            addDeviceStatus(known, [device({ health: 'offline', lastConnectedAt: null })]).tone
        ).toBe('pending');
    });

    test('connects, then reports the device connected', () => {
        expect(addDeviceStatus(known, [device({ reportedInventory: null })]).label).toBe(
            'Connecting…'
        );
        expect(addDeviceStatus(known, [device({})])).toEqual({
            command: null,
            label: 'Connected',
            recheckComputerId: null,
            tone: 'success',
        });
    });

    test('asks for a sign-in on the Mac and offers a recheck', () => {
        expect(addDeviceStatus(known, [device({ reportedInventory: inventory([]) })])).toEqual({
            command: null,
            label: 'Sign in to Claude Code or Codex on this Mac',
            recheckComputerId: 'cmp_new',
            tone: 'warning',
        });
    });

    test('asks for an update with the full-path command', () => {
        for (const entry of [
            device({ health: 'update-required' }),
            device({ inventoryInvalidAt: '2026-11-20T00:00:00Z' }),
        ]) {
            expect(addDeviceStatus(known, [entry])).toMatchObject({
                command: '$HOME/.local/bin/haus-computer upgrade',
                label: 'Update needed',
            });
        }
    });

    test('points a disconnected device back to Setup', () => {
        expect(addDeviceStatus(known, [device({ health: 'offline' })]).label).toBe(
            'Disconnected. Run Setup again.'
        );
    });

    test('follows the newest new device', () => {
        expect(
            addDeviceStatus(known, [
                device({ createdAt: '2026-11-20T00:00:00Z', health: 'offline', id: 'cmp_a' }),
                device({ createdAt: '2026-11-20T00:01:00Z', id: 'cmp_b' }),
            ]).label
        ).toBe('Connected');
    });
});

function device(overrides: Partial<AddedDevice>) {
    return {
        attachedByCurrentUser: true,
        createdAt: '2026-11-20T00:00:00Z',
        health: 'healthy',
        id: 'cmp_new',
        inventoryInvalidAt: null,
        lastConnectedAt: '2026-11-20T00:00:00Z',
        reportedInventory: inventory([{ id: 'gpt-5.6-terra' }]),
        ...overrides,
    } satisfies AddedDevice;
}

function inventory(models: { id: string }[]) {
    return {
        runtimes: [{ id: 'codex', models }],
    } as unknown as ComputerInventory;
}
