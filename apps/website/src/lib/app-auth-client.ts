import { type AppSession, appAuthErrorSchema, appSessionSchema } from '@haus/api/app-session';
import { createDevSignOutPreference, isLoopbackHost } from './app-auth-session.ts';
import { getDesktopBridge } from './desktop-bridge.ts';

const sessionRequestHeader = 'X-Haus-Session-Request';
const devSignOutPreference = createDevSignOutPreference(() => window.localStorage);

declare global {
    interface Window {
        __hausE2eAppSession?: unknown;
    }
}

export async function readAppSession(): Promise<
    { kind: 'session'; session: AppSession } | { kind: 'signed-out' }
> {
    const desktop = getDesktopBridge();
    if (desktop) {
        if (!desktop.authRefresh) {
            throw new Error(
                'We couldn’t open your sign-in session. Please restart Haus and try again.'
            );
        }
        return parseDesktopSession(await desktop.authRefresh());
    }

    const e2eSession = readE2eSession();
    if (e2eSession) {
        return { kind: 'session', session: e2eSession };
    }

    const devFixture = isLocalDevFixtureEnabled();
    if (devFixture && devSignOutPreference.isSignedOut()) {
        return { kind: 'signed-out' };
    }
    const response = await fetch(devFixture ? '/auth/dev/session' : '/auth/session', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { [sessionRequestHeader]: '1' },
    });

    if (
        response.redirected ||
        !response.headers.get('content-type')?.includes('application/json')
    ) {
        return { kind: 'signed-out' };
    }
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
            return { kind: 'signed-out' };
        }
        throw new Error('We couldn’t check your sign-in session. Please try again.');
    }

    const body: unknown = await response.json().catch(() => undefined);
    const parsed = appSessionSchema.safeParse(body);
    if (!parsed.success) {
        const authError = appAuthErrorSchema.safeParse(body);
        if (authError.success && authError.data.error !== 'auth_unavailable') {
            return { kind: 'signed-out' };
        }
        throw new Error('We couldn’t check your sign-in session. Please try again.');
    }
    return { kind: 'session', session: parsed.data };
}

export function isLocalDevFixtureEnabled(): boolean {
    return (
        import.meta.env.DEV &&
        isLoopbackHost(window.location.hostname) &&
        import.meta.env.MODE !== 'test'
    );
}

export function setLocalDevSignOutPreference(signedOut: boolean): void {
    devSignOutPreference.setSignedOut(signedOut);
}

export function parseDesktopSession(value: unknown) {
    if (value === null) {
        return { kind: 'signed-out' as const };
    }
    const parsed = appSessionSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error(
            'We couldn’t open your sign-in session. Please restart Haus and try again.'
        );
    }
    return { kind: 'session' as const, session: parsed.data };
}

function readE2eSession(): AppSession | null {
    if (
        !import.meta.env.DEV ||
        import.meta.env.MODE !== 'test' ||
        !isLoopbackHost(window.location.hostname)
    ) {
        return null;
    }
    const parsed = appSessionSchema.safeParse(window.__hausE2eAppSession);
    return parsed.success && Date.parse(parsed.data.expiresAt) > Date.now() ? parsed.data : null;
}
