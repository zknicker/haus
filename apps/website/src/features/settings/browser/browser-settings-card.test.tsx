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

test('explains shared Browser access without claiming lifecycle ownership', () => {
    const html = renderToStaticMarkup(
        <BrowserSettingsCard
            onRefresh={() => undefined}
            onSave={() => undefined}
            settings={settings}
        />
    );
    const { description } = browserCapabilityView({ settings });
    expect(html).toContain('Connected');
    expect(description).toContain('Disconnecting Haus leaves Chrome open.');
    expect(description).not.toContain('Haus manages');
    expect(html).toContain('aria-label="Chrome actions"');
});

test('the Chrome row keeps its state explanation behind an info button, not a description line', () => {
    const html = renderToStaticMarkup(
        <BrowserSettingsCard
            onRefresh={() => undefined}
            onSave={() => undefined}
            settings={settings}
        />
    );
    expect(html).toContain('aria-label="About Chrome"');
    expect(html).not.toContain('item-card__description');
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
