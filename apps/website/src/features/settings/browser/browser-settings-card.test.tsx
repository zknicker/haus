import { expect, test } from 'bun:test';
import type { AgentRuntimeBrowserSettings } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { browserCapabilityView } from '../../computers/browser-capability-model.ts';
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

test('a connected Chrome row stays quiet and names the shared browser', () => {
    const shared: AgentRuntimeBrowserSettings = {
        ...settings,
        browsers: [
            {
                applicationPath: '/Applications/Google Chrome.app',
                available: true,
                name: 'Google Chrome',
                userDataDir: '/shared',
                version: '153',
            },
        ],
    };
    const html = renderToStaticMarkup(
        <BrowserSettingsCard
            onRefresh={() => undefined}
            onSave={() => undefined}
            settings={shared}
        />
    );
    expect(browserCapabilityView({ settings: shared })).toMatchObject({
        detail: 'Google Chrome',
        status: 'ready',
    });
    expect(html).toContain('Google Chrome');
    expect(html).not.toContain('Connected');
    expect(html).not.toContain('aria-label="About Chrome"');
    expect(html).toContain('aria-label="Chrome actions"');
});

test('a Chrome row that needs a look shows its exception under the title', () => {
    const html = renderToStaticMarkup(
        <BrowserSettingsCard
            onRefresh={() => undefined}
            onSave={() => undefined}
            settings={{ ...settings, enabled: false }}
        />
    );
    expect(html).toMatch(/item-card__description[^>]*>Disconnected</u);
    expect(html).not.toContain('data-slot="badge"');
    expect(html).not.toContain('data-slot="chip"');
});

test('while the device answers, the Browser card shows its Chrome row as Checking, not a blank box', () => {
    const html = renderToStaticMarkup(
        <BrowserSettingsCard
            isLoading
            onRefresh={() => undefined}
            onSave={() => undefined}
            settings={null}
        />
    );

    expect(html).toContain('Chrome');
    expect(html).toContain('Checking');
    expect(html).not.toContain('aria-busy');
});
