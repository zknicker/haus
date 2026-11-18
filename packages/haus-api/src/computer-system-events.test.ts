import { describe, expect, test } from 'bun:test';
import { computerSystemEventReportSchema } from './computer-system-events.ts';

describe('computerSystemEventReportSchema', () => {
    test('accepts bounded, typed management events', () => {
        expect(
            computerSystemEventReportSchema.parse({
                events: [
                    {
                        command: 'restart',
                        id: 'cse_1234567890123456',
                        occurredAt: '2026-08-28T12:00:00.000Z',
                        type: 'management-command',
                    },
                ],
                type: 'system-event-report',
            })
        ).toEqual(expect.objectContaining({ type: 'system-event-report' }));
    });

    test('rejects Server-owned events and unbounded reports', () => {
        expect(
            computerSystemEventReportSchema.safeParse({
                events: [
                    {
                        id: 'cse_1234567890123456',
                        occurredAt: '2026-08-28T12:00:00.000Z',
                        type: 'connected',
                    },
                ],
                type: 'system-event-report',
            }).success
        ).toBeFalse();
        expect(
            computerSystemEventReportSchema.safeParse({
                events: Array.from({ length: 101 }, (_, index) => ({
                    command: 'start',
                    id: `cse_${String(index).padStart(16, '0')}`,
                    occurredAt: '2026-08-28T12:00:00.000Z',
                    type: 'management-command',
                })),
                type: 'system-event-report',
            }).success
        ).toBeFalse();
    });
});
