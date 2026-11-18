import { expect, test } from 'bun:test';
import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { browserCapabilityView } from './browser-capability-model.ts';

const settings: AgentRuntimeBrowserSettings = {
    connection: null,
    configured: false,
    enabled: false,
    browsers: [],
    status: null,
    updatedAt: null,
};

test('configuration remains available when no compatible browser is running', () => {
    expect(browserCapabilityView({ settings })).toMatchObject({
        canConfigure: true,
        canEnable: false,
        status: 'not-configured',
    });
});

test('unavailable browser can disconnect, but cannot reconnect until discovered', () => {
    const saved = {
        ...settings,
        connection: { applicationPath: '/Chrome.app', userDataDir: '/shared' },
        configured: true,
        enabled: true,
    };
    expect(browserCapabilityView({ settings: saved })).toMatchObject({
        canDisable: true,
        status: 'attention',
    });
    expect(browserCapabilityView({ settings: { ...saved, enabled: false } })).toMatchObject({
        canEnable: false,
        statusLabel: 'Disconnected',
    });
});
