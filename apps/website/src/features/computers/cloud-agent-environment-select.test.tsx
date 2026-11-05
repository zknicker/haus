import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { cloudAgentCapabilityView } from './cloud-agent-capability-model.ts';
import { CloudAgentCapabilityRow } from './cloud-agent-capability-row.tsx';

const connected = {
    accountEmail: 'delegate@example.com',
    expiresAt: null,
    isDefault: true,
    provider: 'claude',
    ready: true,
    reason: null,
} as const;

function render(view: ReturnType<typeof cloudAgentCapabilityView>) {
    return renderToStaticMarkup(
        <CloudAgentCapabilityRow
            isBusy={false}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
            onMakeDefault={() => undefined}
            onSetEnvironment={() => undefined}
            view={view}
        />
    );
}

function shownEnvironment(markup: string) {
    return markup.match(
        /aria-label="Claude Cloud Agents environment"[\s\S]*?data-slot="select-value"[^>]*><span[^>]*>([^<]+)</
    )?.[1];
}

test('the environment Select renders only for Claude, and not for Cursor', () => {
    const cursorReady = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'cursor',
        state: { ...connected, provider: 'cursor' },
    });
    expect(cursorReady.environments).toBeNull();
    expect(render(cursorReady)).not.toContain('environment');

    const claudeReady = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'claude',
        state: {
            ...connected,
            environmentId: 'env_a',
            environments: [{ id: 'env_a', name: 'Primary' }],
        },
    });
    expect(claudeReady.environments).toEqual([{ id: 'env_a', name: 'Primary' }]);
    expect(render(claudeReady)).toContain('aria-label="Claude Cloud Agents environment"');
});

test('two or more environments with no pin reads as needs-environment and lists every environment', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'claude',
        state: {
            ...connected,
            environmentId: null,
            environments: [
                { id: 'env_a', name: 'Primary' },
                { id: 'env_b', name: 'Secondary' },
            ],
        },
    });
    expect(view.status).toBe('needs-environment');

    const html = render(view);
    expect(html).toContain('Needs environment');
    expect(html).toContain('Primary');
    expect(html).toContain('Secondary');
    expect(html).not.toContain('not pinned');
});

test('zero environments with no pin reads as needs-environment and renders no picker', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'claude',
        state: {
            ...connected,
            environmentId: null,
            environments: [],
        },
    });
    expect(view.status).toBe('needs-environment');

    const html = render(view);
    expect(html).toContain('Needs environment');
    expect(html).not.toContain('aria-label="Claude Cloud Agents environment"');
});

test('a pinned environment shows as the Select’s value', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'claude',
        state: {
            ...connected,
            environmentId: 'env_b',
            environments: [
                { id: 'env_a', name: 'Primary' },
                { id: 'env_b', name: 'Secondary' },
            ],
        },
    });
    expect(view.environmentId).toBe('env_b');
    expect(shownEnvironment(render(view))).toBe('Secondary');
});
