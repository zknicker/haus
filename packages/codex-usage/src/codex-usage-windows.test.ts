import { describe, expect, it } from 'vitest';
import { normalizeCodexUsageResponse } from './index.ts';

describe('normalizeCodexUsageResponse', () => {
    it('classifies a weekly primary window as the current week', () => {
        const snapshot = normalizeCodexUsageResponse(
            {
                rate_limit: {
                    primary_window: {
                        limit_window_seconds: 604_800,
                        reset_after_seconds: 428_077,
                        used_percent: 18,
                    },
                },
            },
            {
                now: new Date('2026-03-14T15:00:00.000Z'),
            }
        );

        expect(snapshot.windows).toEqual([
            {
                id: 'current-week',
                label: 'Current week',
                remainingPercent: 82,
                resetAfterSeconds: 428_077,
                resetsAt: '2026-03-19T13:54:37.000Z',
                usedPercent: 18,
            },
        ]);
    });

    it('promotes a lone slot to the week when reset_after_seconds outlasts a session', () => {
        const snapshot = normalizeCodexUsageResponse(
            {
                rate_limit: {
                    primary_window: {
                        reset_after_seconds: 428_077,
                        used_percent: 18,
                    },
                },
            },
            {
                now: new Date('2026-03-14T15:00:00.000Z'),
            }
        );

        expect(snapshot.windows).toEqual([
            {
                id: 'current-week',
                label: 'Current week',
                remainingPercent: 82,
                resetAfterSeconds: 428_077,
                resetsAt: '2026-03-19T13:54:37.000Z',
                usedPercent: 18,
            },
        ]);
    });

    it('keeps a promoted weekly slot when a second slot reports nothing', () => {
        // The promotion survives the arrival of a second slot: only the long
        // countdown says which window is which, so the slot without one takes
        // the remaining id rather than both falling back to their positions.
        const snapshot = normalizeCodexUsageResponse(
            {
                rate_limit: {
                    primary_window: {
                        reset_after_seconds: 428_077,
                        used_percent: 18,
                    },
                    secondary_window: {
                        used_percent: 40,
                    },
                },
            },
            {
                now: new Date('2026-03-14T15:00:00.000Z'),
            }
        );

        expect(
            snapshot.windows.map((window) => ({
                id: window.id,
                usedPercent: window.usedPercent,
            }))
        ).toEqual([
            { id: 'current-week', usedPercent: 18 },
            { id: 'current-session', usedPercent: 40 },
        ]);
    });

    it('keeps a weekly slot whose countdown has fallen inside session range', () => {
        // The weekly window stops reporting limit_window_seconds near its reset,
        // and a 5_000s countdown must not demote it onto the session slot.
        const snapshot = normalizeCodexUsageResponse(
            {
                rate_limit: {
                    primary_window: {
                        limit_window_seconds: 18_000,
                        reset_after_seconds: 3600,
                        used_percent: 10,
                    },
                    secondary_window: {
                        reset_after_seconds: 5000,
                        used_percent: 40,
                    },
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
                resetsAt: '2026-03-14T16:00:00.000Z',
                usedPercent: 10,
            },
            {
                id: 'current-week',
                label: 'Current week',
                remainingPercent: 60,
                resetAfterSeconds: 5000,
                resetsAt: '2026-03-14T16:23:20.000Z',
                usedPercent: 40,
            },
        ]);
    });

    it('keeps session then week when the slots are already in duration order', () => {
        const snapshot = normalizeCodexUsageResponse(
            {
                rate_limit: {
                    primary_window: {
                        limit_window_seconds: 18_000,
                        used_percent: 10,
                    },
                    secondary_window: {
                        limit_window_seconds: 604_800,
                        used_percent: 40,
                    },
                },
            },
            {
                now: new Date('2026-03-14T15:00:00.000Z'),
            }
        );

        expect(snapshot.windows.map((window) => window.id)).toEqual([
            'current-session',
            'current-week',
        ]);
    });

    it('classifies by duration when the slots are swapped', () => {
        const snapshot = normalizeCodexUsageResponse(
            {
                rate_limit: {
                    primary_window: {
                        limit_window_seconds: 604_800,
                        used_percent: 40,
                    },
                    secondary_window: {
                        limit_window_seconds: 18_000,
                        used_percent: 10,
                    },
                },
            },
            {
                now: new Date('2026-03-14T15:00:00.000Z'),
            }
        );

        expect(snapshot.windows).toEqual([
            {
                id: 'current-week',
                label: 'Current week',
                remainingPercent: 60,
                resetAfterSeconds: null,
                resetsAt: null,
                usedPercent: 40,
            },
            {
                id: 'current-session',
                label: 'Current session',
                remainingPercent: 90,
                resetAfterSeconds: null,
                resetsAt: null,
                usedPercent: 10,
            },
        ]);
    });

    it('keeps the positional assignment when no duration is reported', () => {
        const snapshot = normalizeCodexUsageResponse(
            {
                rate_limit: {
                    primary_window: {
                        reset_at: 1_773_532_800,
                        used_percent: 10,
                    },
                    secondary_window: {
                        reset_at: 1_773_532_800,
                        used_percent: 40,
                    },
                },
            },
            {
                now: new Date('2026-03-14T15:00:00.000Z'),
            }
        );

        expect(snapshot.windows.map((window) => window.id)).toEqual([
            'current-session',
            'current-week',
        ]);
    });

    it('falls back to positional ids when both slots claim the same duration', () => {
        const snapshot = normalizeCodexUsageResponse(
            {
                rate_limit: {
                    primary_window: {
                        limit_window_seconds: 604_800,
                        used_percent: 40,
                    },
                    secondary_window: {
                        limit_window_seconds: 604_800,
                        used_percent: 55,
                    },
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
                remainingPercent: 60,
                resetAfterSeconds: null,
                resetsAt: null,
                usedPercent: 40,
            },
            {
                id: 'current-week',
                label: 'Current week',
                remainingPercent: 45,
                resetAfterSeconds: null,
                resetsAt: null,
                usedPercent: 55,
            },
        ]);
    });
});
