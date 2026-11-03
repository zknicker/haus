import { type AppSession, appSessionSchema } from '@haus/api/app-session';
import * as React from 'react';
import {
    isLocalDevFixtureEnabled,
    parseDesktopSession,
    readAppSession,
    setLocalDevSignOutPreference,
} from './app-auth-client.ts';
import { type AppAuthSnapshot, appAuthStore, sessionRefreshDelay } from './app-auth-session.ts';
import { getDesktopBridge, isElectronDesktopApp } from './desktop-bridge.ts';

interface AppAuthValue {
    refresh: () => Promise<void>;
    session: AppSession | null;
    signIn: (switchAccount?: boolean) => Promise<void>;
    signOut: () => Promise<void>;
    snapshot: AppAuthSnapshot;
}

const AppAuthContext = React.createContext<AppAuthValue | null>(null);
const sessionRequestHeader = 'X-Haus-Session-Request';
declare global {
    interface Window {
        __hausE2eAppSession?: unknown;
    }
}

export function AppAuthProvider({ children }: React.PropsWithChildren) {
    const snapshot = React.useSyncExternalStore(
        appAuthStore.subscribe,
        appAuthStore.current,
        appAuthStore.current
    );
    const refreshInFlight = React.useRef<{ generation: number; promise: Promise<void> } | null>(
        null
    );
    const signOutInFlight = React.useRef<Promise<void> | null>(null);

    const refresh = React.useCallback(() => {
        if (signOutInFlight.current) {
            return signOutInFlight.current;
        }
        const currentGeneration = appAuthStore.getGeneration();
        if (refreshInFlight.current?.generation === currentGeneration) {
            return refreshInFlight.current.promise;
        }
        const generation = appAuthStore.beginRequest();
        const request = readAppSession()
            .then((result) => {
                if (result.kind === 'session') {
                    appAuthStore.set({ kind: 'ready', session: result.session }, generation);
                    return;
                }
                if (result.kind === 'signed-out') {
                    appAuthStore.set({ kind: 'signed-out', session: null }, generation);
                }
            })
            .catch((error: unknown) => {
                if (appAuthStore.isCurrent(generation) && !appAuthStore.getSession()) {
                    appAuthStore.set(
                        {
                            kind: 'failed',
                            message: errorMessage(error),
                            session: null,
                        },
                        generation
                    );
                }
            })
            .finally(() => {
                if (refreshInFlight.current?.promise === request) {
                    refreshInFlight.current = null;
                }
            });
        refreshInFlight.current = { generation, promise: request };
        return request;
    }, []);

    const signOut = React.useCallback(async () => {
        if (signOutInFlight.current) {
            return signOutInFlight.current;
        }
        if (import.meta.env.DEV && import.meta.env.MODE === 'test') {
            window.__hausE2eAppSession = undefined;
        }
        if (isLocalDevFixtureEnabled()) {
            setLocalDevSignOutPreference(true);
        }
        appAuthStore.clear();
        const bridge = getDesktopBridge();
        const operation = (async () => {
            if (bridge) {
                await Promise.resolve(bridge.authSignOut?.()).catch(() => undefined);
            } else {
                await fetch('/auth/logout', {
                    credentials: 'same-origin',
                    headers: { [sessionRequestHeader]: '1' },
                    method: 'POST',
                }).catch(() => undefined);
            }
        })().finally(() => {
            appAuthStore.clear();
            if (signOutInFlight.current === operation) {
                signOutInFlight.current = null;
            }
        });
        signOutInFlight.current = operation;
        return operation;
    }, []);

    const signIn = React.useCallback(
        async (switchAccount = false) => {
            if (signOutInFlight.current) {
                await signOutInFlight.current;
            }
            appAuthStore.invalidatePending();
            if (isElectronDesktopApp()) {
                const bridge = getDesktopBridge();
                if (!bridge?.authSignIn) {
                    throw new Error('The Haus desktop bridge is unavailable.');
                }
                await bridge.authSignIn({ switchAccount });
                return;
            }

            if (switchAccount) {
                await signOut();
            }
            if (isLocalDevFixtureEnabled()) {
                setLocalDevSignOutPreference(false);
                await refresh();
                return;
            }

            const start = new URL('/auth/start', window.location.origin);
            start.searchParams.set(
                'returnTo',
                `${window.location.pathname}${window.location.search}${window.location.hash}`
            );
            if (switchAccount) {
                start.searchParams.set('switchAccount', 'true');
            }
            window.location.assign(start.toString());
        },
        [refresh, signOut]
    );

    React.useEffect(() => {
        const bridge = getDesktopBridge();
        if (bridge) {
            const stopListening =
                bridge.onAuthSession?.((value) => {
                    commitBridgeSession(value);
                }) ?? (() => undefined);
            const generation = appAuthStore.beginRequest();
            const initialize = bridge.authInitialize ?? bridge.authRefresh;
            if (!initialize) {
                setFailed(new Error('The Haus desktop bridge is out of date.'), generation);
                return stopListening;
            }
            void initialize()
                .then((value) => commitBridgeSession(value, generation))
                .catch((error: unknown) => setFailed(error, generation));
            return stopListening;
        }

        void refresh();
    }, [refresh]);

    React.useEffect(() => {
        const retryWhenAvailable = () => {
            const session = appAuthStore.getSession();
            if (
                !session ||
                Date.parse(session.expiresAt) - Date.now() <= 25_000 ||
                appAuthStore.current().kind === 'failed'
            ) {
                void refresh();
            }
        };
        window.addEventListener('online', retryWhenAvailable);
        document.addEventListener('visibilitychange', retryWhenAvailable);
        return () => {
            window.removeEventListener('online', retryWhenAvailable);
            document.removeEventListener('visibilitychange', retryWhenAvailable);
        };
    }, [refresh]);

    React.useEffect(() => {
        if (snapshot.kind !== 'ready') {
            return;
        }

        const { session } = snapshot;
        const refreshTimer = window.setTimeout(() => void refresh(), sessionRefreshDelay(session));
        const expiryDelay = Math.max(0, Date.parse(session.expiresAt) - Date.now());
        const expiryTimer = window.setTimeout(
            () => appAuthStore.clearIfExpired(session.expiresAt),
            expiryDelay
        );
        return () => {
            window.clearTimeout(refreshTimer);
            window.clearTimeout(expiryTimer);
        };
    }, [refresh, snapshot]);

    const value = React.useMemo<AppAuthValue>(
        () => ({
            refresh,
            session: snapshot.session,
            signIn,
            signOut,
            snapshot,
        }),
        [refresh, signIn, signOut, snapshot]
    );

    return <AppAuthContext value={value}>{children}</AppAuthContext>;
}

export function useAppAuth(): AppAuthValue {
    const value = React.use(AppAuthContext);
    if (!value) {
        throw new Error('useAppAuth must be used inside AppAuthProvider.');
    }
    return value;
}

export function getAppSessionAccessToken(): string | null {
    return appAuthStore.getAccessToken();
}

export function seedDesktopAppSession(): void {
    const value = getDesktopBridge()?.authSessionPeek?.();
    const parsed = appSessionSchema.safeParse(value);
    if (parsed.success && Date.parse(parsed.data.expiresAt) > Date.now()) {
        appAuthStore.set({ kind: 'ready', session: parsed.data });
    }
}

function commitBridgeSession(value: unknown, expectedGeneration?: number) {
    try {
        const result = parseDesktopSession(value);
        if (result.kind === 'session') {
            appAuthStore.set({ kind: 'ready', session: result.session }, expectedGeneration);
        } else {
            appAuthStore.set({ kind: 'signed-out', session: null }, expectedGeneration);
        }
    } catch (error) {
        setFailed(error, expectedGeneration);
    }
}

function setFailed(error: unknown, expectedGeneration?: number) {
    if (!appAuthStore.getSession()) {
        appAuthStore.set(
            { kind: 'failed', message: errorMessage(error), session: null },
            expectedGeneration
        );
    }
}

function errorMessage(_error: unknown) {
    return 'We couldn’t check your sign-in session. Please try again.';
}
