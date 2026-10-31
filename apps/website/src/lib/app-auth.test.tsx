import { expect, test } from 'bun:test';
import type { AppSession } from '@haus/api/app-session';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppAuthProvider, useAppAuth } from './app-auth.tsx';
import { appAuthStore } from './app-auth-session.ts';

test('web development sign-in refreshes the fixture and account switch logs out before restart', async () => {
    const priorDev = process.env.DEV;
    const priorMode = process.env.MODE;
    const priorFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
    const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const values = new Map<string, string>();
    const events: string[] = [];
    const session: AppSession = {
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
    let signIn: ((switchAccount?: boolean) => Promise<void>) | undefined;

    process.env.DEV = 'true';
    process.env.MODE = 'development';
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            location: {
                assign: (url: string) => events.push(`navigate:${url}`),
                hash: '#draft',
                hostname: '127.0.0.1',
                origin: 'http://127.0.0.1:3101',
                pathname: '/servers/demo',
                search: '?tab=chat',
            },
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
            const path = String(input);
            events.push(`fetch:${path}`);
            return path === '/auth/dev/session'
                ? Response.json(session)
                : new Response(null, { status: 204 });
        },
    });

    function CaptureSignIn() {
        signIn = useAppAuth().signIn;
        return null;
    }

    try {
        renderToStaticMarkup(createElement(AppAuthProvider, null, createElement(CaptureSignIn)));
        values.set('haus.dev-auth.signed-out', 'true');
        await signIn?.();
        expect(events).toEqual(['fetch:/auth/dev/session']);

        Reflect.deleteProperty(process.env, 'DEV');
        process.env.MODE = 'production';
        await signIn?.(true);

        expect(events[1]).toBe('fetch:/auth/logout');
        const navigation = events[2];
        if (!navigation) {
            throw new Error('Web account switch did not restart authentication.');
        }
        const start = new URL(navigation.slice('navigate:'.length));
        expect(start.pathname).toBe('/auth/start');
        expect(start.searchParams.get('switchAccount')).toBe('true');
        expect(start.searchParams.get('returnTo')).toBe('/servers/demo?tab=chat#draft');
        expect(events.some((event) => event.includes('cloudflareaccess.com'))).toBe(false);
    } finally {
        appAuthStore.clear();
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
