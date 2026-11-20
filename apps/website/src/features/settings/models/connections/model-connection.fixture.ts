import type { ModelConnection } from '@haus/api';

export function testConnection(overrides: Partial<ModelConnection> = {}) {
    return {
        authKind: 'setup-token',
        capacity: null,
        id: 'mcn_claude',
        isDefault: true,
        label: 'Claude plan',
        position: 0,
        provider: 'claude',
        status: 'ready',
        statusDetail: null,
        updatedAt: '2026-11-19T12:00:00.000Z',
        webSearch: false,
        ...overrides,
    } satisfies ModelConnection;
}
