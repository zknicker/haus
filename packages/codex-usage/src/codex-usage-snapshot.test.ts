import { describe, expect, it } from 'vitest';
import { normalizeCodexUsageResponse } from './index.ts';

describe('normalizeCodexUsageResponse snapshot shape', () => {
    it('prefers header percentages and derives reset timestamps', () => {
        const snapshot = normalizeCodexUsageResponse(
            {
                credits: {
                    balance: '25',
                },
                plan_type: 'pro',
                rate_limit: {
                    primary_window: {
                        reset_after_seconds: 3600,
                        used_percent: 10,
                    },
                    secondary_window: {
                        reset_at: 1_773_532_800,
                        used_percent: 40,
                    },
                },
            },
            {
                capturedAt: new Date('2026-03-14T15:00:00.000Z'),
                headers: new Headers({
                    'x-codex-primary-used-percent': '12',
                    'x-codex-secondary-used-percent': '43',
                }),
                now: new Date('2026-03-14T15:00:00.000Z'),
            }
        );

        expect(snapshot).toEqual({
            capturedAt: '2026-03-14T15:00:00.000Z',
            creditsBalance: 25,
            planType: 'pro',
            provider: 'codex',
            source: 'chatgpt-wham-usage',
            windows: [
                {
                    id: 'current-session',
                    label: 'Current session',
                    remainingPercent: 88,
                    resetAfterSeconds: 3600,
                    resetsAt: '2026-03-14T16:00:00.000Z',
                    usedPercent: 12,
                },
                {
                    id: 'current-week',
                    label: 'Current week',
                    remainingPercent: 57,
                    resetAfterSeconds: null,
                    resetsAt: '2026-03-15T00:00:00.000Z',
                    usedPercent: 43,
                },
            ],
        });
    });

    it('accepts the current nullable secondary window contract', () => {
        const snapshot = normalizeCodexUsageResponse(
            {
                credits: {
                    balance: '25',
                },
                plan_type: 'pro',
                rate_limit: {
                    primary_window: {
                        limit_window_seconds: 18_000,
                        reset_after_seconds: 3600,
                        reset_at: 1_773_532_800,
                        used_percent: 10,
                    },
                    secondary_window: null,
                },
            },
            {
                now: new Date('2026-03-14T15:00:00.000Z'),
            }
        );

        expect(snapshot.windows).toEqual([
            {
                id: 'current-session',
                label: 'Current session',
                remainingPercent: 90,
                resetAfterSeconds: 3600,
                resetsAt: '2026-03-15T00:00:00.000Z',
                usedPercent: 10,
            },
        ]);
    });
});
