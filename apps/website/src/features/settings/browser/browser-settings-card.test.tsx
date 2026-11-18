import { expect, test } from 'bun:test';
import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrowserSettingsCard } from './browser-settings-card.tsx';

const settings: AgentRuntimeBrowserSettings = {
    configured: true,
    enabled: true,
    connection: { applicationPath: '/Applications/Google Chrome.app', userDataDir: '/shared' },
    browsers: [],
    updatedAt: null,
    status: {
        browserVersion: '153',
        cdpState: 'healthy',
        checkedAt: '2026-09-09T16:00:00.000Z',
        pid: 123,
        reason: null,
        running: true,
        state: 'healthy',
        uptimeSeconds: 60,
    },
};

test('explains shared Browser access without claiming lifecycle ownership', () => {
    const html = renderToStaticMarkup(
        <BrowserSettingsCard
            onRefresh={() => undefined}
            onSave={() => undefined}
            settings={settings}
        />
    );
    expect(html).toContain('Connected');
    expect(html).toContain('Disconnecting Haus leaves Chrome open.');
    expect(html).not.toContain('Haus manages');
    expect(html).toContain('aria-label="Chrome actions"');
});
