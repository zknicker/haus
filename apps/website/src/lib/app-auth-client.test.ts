import { expect, test } from 'bun:test';
import type { AppSession } from '@haus/api/app-session';
import {
    isLocalDevFixtureEnabled,
    readAppSession,
    setLocalDevSignOutPreference,
} from './app-auth-client.ts';

test('local development keeps explicit sign-out until a sign-in refresh clears it', async () => {
    const priorDev = process.env.DEV;
    const priorMode = process.env.MODE;
    const priorFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const values = new Map<string, string>();
    const paths: string[] = [];
    const appSession: AppSession = {
        accessToken: 'dev-access',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        issuedAt: new Date().toISOString(),
        sessionId: 'sid_dev',
        user: {
            avatarId: null,
            displayName: 'Local Developer',
            email: 'dev@haus.test',
            id: 'usr_dev',
        },
    };

    process.env.DEV = 'true';
    process.env.MODE = 'development';
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            location: { hostname: '127.0.0.1' },
            localStorage: {
                getItem: (key: string) => values.get(key) ?? null,
                removeItem: (key: string) => values.delete(key),
                setItem: (key: string, value: string) => values.set(key, value),
            },
        },
    });
    Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: async (input: URL | RequestInfo) => {
            paths.push(String(input));
            return Response.json(appSession);
        },
    });

    try {
        expect(isLocalDevFixtureEnabled()).toBe(true);
        expect(await readAppSession()).toEqual({ kind: 'session', session: appSession });

        setLocalDevSignOutPreference(true);
        expect(await readAppSession()).toEqual({ kind: 'signed-out' });
        expect(paths).toEqual(['/auth/dev/session']);

        setLocalDevSignOutPreference(false);
        expect(await readAppSession()).toEqual({ kind: 'session', session: appSession });
        expect(paths).toEqual(['/auth/dev/session', '/auth/dev/session']);
    } finally {
        setLocalDevSignOutPreference(false);
        if (priorFetch) {
            Object.defineProperty(globalThis, 'fetch', priorFetch);
        } else {
            Reflect.deleteProperty(globalThis, 'fetch');
        }
        if (priorWindow) {
            Object.defineProperty(globalThis, 'window', priorWindow);
        } else {
            Reflect.deleteProperty(globalThis, 'window');
        }
        restoreEnvironment('DEV', priorDev);
        restoreEnvironment('MODE', priorMode);
    }
});

function restoreEnvironment(key: 'DEV' | 'MODE', value: string | undefined) {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, key);
    } else {
        process.env[key] = value;
    }
}
