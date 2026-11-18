import { expect, test } from 'bun:test';
import { systemEventLabel } from './computer-system-log.ts';

test('system events name Computer lifecycle and Server connection changes directly', () => {
    expect(
        systemEventLabel({
            id: 'cse_1234567890123456',
            occurredAt: '2026-08-28T12:00:00.000Z',
            type: 'connected',
        })
    ).toBe('Connected to Server');

    const commands = [
        ['start', 'Computer started'],
        ['stop', 'Computer stopped'],
        ['restart', 'Computer restarted'],
        ['upgrade', 'Computer upgraded'],
        ['rollback', 'Computer rolled back'],
    ] as const;

    expect(
        commands.map(([command], index) =>
            systemEventLabel({
                command,
                id: `cse_${String(index).padStart(16, '0')}`,
                occurredAt: '2026-08-28T12:00:00.000Z',
                type: 'management-command',
            })
        )
    ).toEqual(commands.map(([, event]) => event));

    expect(
        systemEventLabel({
            id: 'cse_1234567890123456',
            occurredAt: '2026-08-28T12:00:00.000Z',
            reason: 'socket-closed',
            type: 'disconnected',
        })
    ).toBe('Disconnected from Server');
});
