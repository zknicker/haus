import { expect, test } from 'bun:test';
import type { UsageOverview } from '@haus/api';
import { normalizeStoredUsage } from './computer-usage.ts';

test('Server returns a retained provider snapshot with its retention stamp intact', () => {
    const stored = storedUsage({
        claude: {
            provider: 'claude',
            snapshot: claudeSnapshot,
            stale: { at: '2026-09-08T15:00:00.000Z', code: 'auth' },
            status: 'ok',
        },
    });

    const normalized = normalizeStoredUsage(stored);

    expect(normalized?.claude).toEqual({
        provider: 'claude',
        snapshot: claudeSnapshot,
        stale: { at: '2026-09-08T15:00:00.000Z', code: 'auth' },
        status: 'ok',
    });
});

test('Server fills only the fields older Computers never reported', () => {
    const { grok, runtimeUsage, ...withoutGrok } = storedUsage();

    const normalized = normalizeStoredUsage(withoutGrok as UsageOverview);

    expect(normalized?.grok).toMatchObject({ provider: 'grok', status: 'error' });
    expect(normalized?.runtimeUsage).toEqual([]);
    expect(normalized?.claude.status).toBe('ok');
});

const claudeSnapshot = {
    capturedAt: '2026-09-08T14:00:00.000Z',
    extraUsage: null,
    provider: 'claude',
    source: 'anthropic-oauth-usage',
    subscriptionType: 'max',
    windows: [],
} satisfies Extract<UsageOverview['claude'], { status: 'ok' }>['snapshot'];

function storedUsage(overrides: Partial<UsageOverview> = {}): UsageOverview {
    return {
        capturedAt: '2026-09-08T15:00:00.000Z',
        claude: { provider: 'claude', snapshot: claudeSnapshot, status: 'ok' },
        codex: {
            error: { code: 'auth', message: 'Unavailable.', name: 'UsageError' },
            provider: 'codex',
            status: 'error',
        },
        connectedProviders: ['claude-code'],
        grok: {
            error: { code: 'auth', message: 'Unavailable.', name: 'UsageError' },
            provider: 'grok',
            status: 'error',
        },
        openRouter: {
            error: null,
            overview: {
                days: 30,
                keys: [],
                message: null,
                note: null,
                series: [],
                status: 'unconfigured',
                totalByokUsageUsd: 0,
                totalRequests: 0,
                totalUsageUsd: 0,
            },
            status: 'ok',
        },
        runtimeUsage: [],
        ...overrides,
    };
}
