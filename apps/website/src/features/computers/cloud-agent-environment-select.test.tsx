import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    cloudAgentCapabilityView,
    cloudAgentEnvironmentSelection,
    cloudAgentNotPinnedEnvironmentKey,
} from './cloud-agent-capability-model.ts';
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
            environmentId: null,
            environments: [{ id: 'env_a', name: 'Primary' }],
        },
    });
    expect(claudeReady.environments).toEqual([{ id: 'env_a', name: 'Primary' }]);
    expect(render(claudeReady)).toContain('aria-label="Claude Cloud Agents environment"');
});

test('with no pin, the Select shows Claude’s default and lists the Computer’s own environments', () => {
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
    expect(view.environmentId).toBeNull();
    const html = render(view);
    expect(html).toContain('Claude’s default (not pinned)');
    expect(html).toContain('Primary');
    expect(html).toContain('Secondary');
    expect(shownEnvironment(html)).toBe('Claude’s default (not pinned)');
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

test('the row wires the Select straight through the resolver: a real id passes untouched, the sentinel becomes null', () => {
    // CloudAgentCapabilityRow's onChange is `onSetEnvironment(cloudAgentEnvironmentSelection(value))`
    // with no translation of its own, so the resolver's own behavior is the row's whole contract
    // here. `renderToStaticMarkup` cannot fire a real onChange to prove that wiring from the DOM side.
    expect(cloudAgentEnvironmentSelection('env_a')).toBe('env_a');
    expect(cloudAgentEnvironmentSelection(cloudAgentNotPinnedEnvironmentKey)).toBeNull();
});
