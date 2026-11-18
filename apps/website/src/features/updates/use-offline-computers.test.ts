import { describe, expect, test } from 'bun:test';
import { expectedComputerRestartMs } from './haus-update-timing.ts';
import { isOfflineComputerNoticeCandidate, nextUpdateExpiry } from './use-offline-computers.ts';

const observedAt = Date.parse('2026-08-29T16:00:00.000Z');

describe('offline Computer attention', () => {
    test('reports ordinary offline Computers independently from updates', () => {
        expect(
            isOfflineComputerNoticeCandidate(
                { health: 'offline', updatePhase: 'idle', updateUpdatedAt: null },
                observedAt
            )
        ).toBe(true);
        expect(
            isOfflineComputerNoticeCandidate(
                { health: 'healthy', updatePhase: 'failed', updateUpdatedAt: null },
                observedAt
            )
        ).toBe(false);
    });

    test('suppresses an expected restart disconnect until it times out', () => {
        expect(
            isOfflineComputerNoticeCandidate(
                {
                    health: 'offline',
                    updatePhase: 'restarting',
                    updateUpdatedAt: new Date(observedAt - 5000).toISOString(),
                },
                observedAt
            )
        ).toBe(false);
        expect(
            isOfflineComputerNoticeCandidate(
                {
                    health: 'offline',
                    updatePhase: 'restarting',
                    updateUpdatedAt: new Date(observedAt - expectedComputerRestartMs).toISOString(),
                },
                observedAt
            )
        ).toBe(true);
    });

    test('wakes the updater when a disconnected download becomes unconfirmed', () => {
        const lastProgress = observedAt - 5000;
        expect(
            nextUpdateExpiry(
                [
                    {
                        health: 'offline',
                        updatePhase: 'downloading',
                        updateUpdatedAt: new Date(lastProgress).toISOString(),
                    },
                ],
                observedAt
            )
        ).toBe(lastProgress + expectedComputerRestartMs);
    });
});
