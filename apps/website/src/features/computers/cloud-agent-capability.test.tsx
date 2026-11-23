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
    isDefault: true,
    provider: 'cursor',
    ready: true,
    reason: null,
} as const;

function unready(reason: 'expired' | 'not-connected' | 'provider-unavailable') {
    return {
        accountEmail: null,
        expiresAt: null,
        isDefault: true,
        provider: 'cursor',
        ready: false,
        reason,
    } as const;
}

function render(view: ReturnType<typeof cloudAgentCapabilityView>) {
    return renderToStaticMarkup(
        <CloudAgentCapabilityRow
            isBusy={false}
            onConnect={() => undefined}
            onDisconnect={() => undefined}
            onSetEnvironment={() => undefined}
            view={view}
        />
    );
}

test('an unconnected Computer offers Connect and no disconnect', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'cursor',
        state: unready('not-connected'),
    });
    expect(view).toMatchObject({ canConnect: true, canDisconnect: false, status: 'not-connected' });

    const html = render(view);
    expect(html).toContain('>Cursor Cloud<');
    expect(html).toContain('Not connected');
    expect(html).toContain('Connect');
    expect(html).not.toContain('Cursor actions');
});

test('a connected Computer names its account and hides Disconnect behind the row menu', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'cursor',
        state: connected,
    });
    expect(view).toMatchObject({ canConnect: false, canDisconnect: true, status: 'ready' });
    expect(view.description).toContain('delegate@example.com');

    const html = render(view);
    expect(html).toContain('Ready');
    expect(html).toContain('aria-label="Cursor actions"');
    // The trigger is an icon-only ghost button, like every other row menu.
    expect(html).toContain('button--icon-only');
    // Disconnect lives in the menu popover, which does not render until opened.
    expect(html).not.toContain('>Connect<');
});

test('an expired key reads as expired and still offers a reconnect', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'cursor',
        state: unready('expired'),
    });
    expect(view).toMatchObject({ canConnect: true, canDisconnect: true, statusLabel: 'Expired' });
    expect(render(view)).toContain('Expired');
});

test('a Computer that cannot reach Cursor offers nothing to press', () => {
    for (const state of [unready('provider-unavailable'), null]) {
        const view = cloudAgentCapabilityView({
            isConnecting: false,
            isOffline: false,
            provider: 'cursor',
            state,
        });
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
        provider: 'cursor',
        state: connected,
    });
    expect(view.status).toBe('unavailable');
    expect(view.description).toContain('Reconnect this device');
});

test('the row reads as connecting while the Computer runs Cursor’s browser sign-in', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: true,
        isOffline: false,
        provider: 'cursor',
        state: unready('not-connected'),
    });
    expect(view.statusLabel).toBe('Connecting');
    expect(view.canConnect).toBe(false);
    expect(render(view)).toContain('Connecting');
});

test('the Computer report renders the row before the settings read answers', () => {
    expect(
        reportedCloudAgentCapability(
            {
                cloudAgentProviders: [
                    {
                        isDefault: true,
                        models: null,
                        provider: 'cursor',
                        ready: false,
                        reason: 'expired',
                    },
                ],
                runtimes: [],
            },
            'cursor'
        )
    ).toEqual(unready('expired'));
    expect(reportedCloudAgentCapability({ runtimes: [] }, 'cursor')).toBeNull();
    expect(reportedCloudAgentCapability(null, 'claude')).toBeNull();
});

test('a pending sign-in can be resumed after closing or reloading settings', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'cursor',
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
            provider: 'cursor',
            state: unready('not-connected'),
        }).status
    ).toBe('unavailable');
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'cursor',
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

test('Claude reuses the Computer’s Claude Code login: it checks again and never disconnects', () => {
    const signedOut = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'claude',
        state: { ...unready('not-connected'), isDefault: false, provider: 'claude' },
    });
    expect(signedOut).toMatchObject({ canConnect: true, connectLabel: 'Check again' });
    expect(signedOut.description).toContain('Claude Code');
    expect(render(signedOut)).toContain('>Claude Cloud<');

    const ready = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'claude',
        state: { ...connected, expiresAt: null, isDefault: false, provider: 'claude' },
    });
    expect(ready).toMatchObject({ canDisconnect: false, status: 'ready' });
    expect(render(ready)).not.toContain('aria-label="Claude actions"');
});

test('a row offers no Make default: the Project default decides where Workers run', () => {
    const view = cloudAgentCapabilityView({
        isConnecting: false,
        isOffline: false,
        provider: 'cursor',
        state: connected,
    });
    const html = render(view);
    expect(html).not.toContain('Make default');
    expect(html).not.toContain('>Default<');
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
