import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    cloudAgentCapabilityView,
    reportedCloudAgentCapability,
} from './cloud-agent-capability-model.ts';
import { CloudAgentCapabilityRow } from './cloud-agent-capability-row.tsx';
import { cloudAgentSignInView } from './cloud-agent-sign-in-model.ts';

const connected = {
    accountEmail: 'delegate@example.com',
    expiresAt: '2026-12-03T21:03:33.000Z',
    provider: 'cursor',
    ready: true,
    reason: null,
} as const;

function unready(reason: 'expired' | 'not-connected' | 'provider-unavailable') {
    return {
        accountEmail: null,
        expiresAt: null,
        provider: 'cursor',
        ready: false,
        reason,
    } as const;
}

function render(view: ReturnType<typeof cloudAgentCapabilityView>) {
    return renderToStaticMarkup(
        <CloudAgentCapabilityRow
            isDisconnecting={false}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
            view={view}
        />
    );
}

test('an unconnected Computer offers Connect and no disconnect', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        state: unready('not-connected'),
    });
    expect(view).toMatchObject({ canConnect: true, canDisconnect: false, status: 'not-connected' });

    const html = render(view);
    expect(html).toContain('Cursor Cloud Agents');
    expect(html).toContain('Not connected');
    expect(html).toContain('Connect');
    expect(html).not.toContain('Cursor Cloud Agents actions');
});

test('a connected Computer names its account and hides Disconnect behind the row menu', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        state: connected,
    });
    expect(view).toMatchObject({ canConnect: false, canDisconnect: true, status: 'ready' });
    expect(view.description).toContain('delegate@example.com');

    const html = render(view);
    expect(html).toContain('Ready');
    expect(html).toContain('aria-label="Cursor Cloud Agents actions"');
    // The trigger is an icon-only ghost button, like every other row menu.
    expect(html).toContain('button--icon-only');
    // Disconnect lives in the menu popover, which does not render until opened.
    expect(html).not.toContain('>Connect<');
});

test('an expired key reads as expired and still offers a reconnect', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        state: unready('expired'),
    });
    expect(view).toMatchObject({ canConnect: true, canDisconnect: true, statusLabel: 'Expired' });
    expect(render(view)).toContain('Expired');
});

test('a Computer that cannot reach Cursor offers nothing to press', () => {
    for (const state of [unready('provider-unavailable'), null]) {
        const view = cloudAgentCapabilityView({ isConnecting: false, isOffline: false, state });
        expect(view).toMatchObject({
            canConnect: false,
            canDisconnect: false,
            status: 'unavailable',
        });
        expect(render(view)).toContain('disabled=""');
    }
});

test('an offline Computer says so instead of claiming a readiness it cannot read', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: true,
        state: connected,
    });
    expect(view.status).toBe('unavailable');
    expect(view.description).toContain('Reconnect this Computer');
});

test('the row reads as connecting while the Computer runs Cursor’s browser sign-in', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: true,
        isOffline: false,
        state: unready('not-connected'),
    });
    expect(view.statusLabel).toBe('Connecting');
    expect(view.canConnect).toBe(false);
    expect(render(view)).toContain('Connecting');
});

test('the Computer report renders the row before the settings read answers', () => {
    expect(
        reportedCloudAgentCapability({
            cloudAgentProviders: [{ provider: 'cursor', ready: false, reason: 'expired' }],
            runtimes: [],
        })
    ).toEqual(unready('expired'));
    expect(reportedCloudAgentCapability({ runtimes: [] })).toBeNull();
    expect(reportedCloudAgentCapability(null)).toBeNull();
});

test('a pending sign-in can be resumed after closing or reloading settings', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        state: {
            ...unready('not-connected'),
            signIn: {
                status: 'waiting',
                url: 'https://cursor.com/loginDeepControl',
                expiresAt: '2026-09-21T18:00:00.000Z',
            },
        },
    });
    expect(view.canConnect).toBe(true);
    expect(render(view)).toContain('Continue sign-in');
    expect(render(view)).not.toContain('browser window on that Computer');
});

test('offline wins over an in-flight sign-in and failures explain recovery', () => {
    expect(
        cloudAgentCapabilityView({
            isConnecting: true,
            isOffline: true,
            state: unready('not-connected'),
        }).status
    ).toBe('unavailable');
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        state: {
            ...unready('not-connected'),
            signIn: {
                status: 'failed',
                message: 'This sign-in expired. Try again to get a new link.',
            },
        },
    });
    expect(view.canConnect).toBe(true);
    expect(view.description).toContain('expired');
});

test('recovered Computer state supersedes a lost connect response', () => {
    expect(
        cloudAgentSignInView({
            isOffline: false,
            isStarting: false,
            error: new Error('Lost response'),
            state: connected,
        })
    ).toEqual({ status: 'connected', email: connected.accountEmail });
});
