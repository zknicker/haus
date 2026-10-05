import type { FapiRequestInit, FapiResponse } from '@clerk/clerk-js/dist/types/core/fapiClient';
import { Clerk } from '@clerk/clerk-js/headless';
import {
    type ClerkSessionSeed,
    isUsableSeed,
    parseClerkSessionSeed,
} from './clerk-session-seed.ts';
import { createSessionShare, shareRefreshLeewaySeconds } from './clerk-session-share.ts';
import { getDesktopBridge } from './desktop-bridge.ts';

let nativeClerk: Clerk | null = null;
let sessionSeed: ClerkSessionSeed | null | undefined;
const sessionShare = createSessionShare({
    publish: async (token) => {
        await getDesktopBridge()?.authSessionShare?.(token);
    },
    refresh: () => {
        if (!nativeClerk?.loaded) {
            return;
        }
        readSessionToken(nativeClerk, { leewayInSeconds: shareRefreshLeewaySeconds }).catch(
            (error: unknown) => {
                console.warn('[Clerk] Could not refresh the shared desktop session.', error);
            }
        );
    },
});

export function getNativeClerk(publishableKey: string): Clerk {
    if (nativeClerk?.publishableKey === publishableKey) {
        return nativeClerk;
    }

    if (nativeClerk) {
        void getRequiredDesktopBridge().authTokenSet(null);
    }

    const clerk = new Clerk(publishableKey);

    clerk.__unstable__onBeforeRequest(async (requestInit: FapiRequestInit) => {
        requestInit.credentials = 'omit';
        requestInit.url?.searchParams.append('_is_native', '1');

        const jwt = await getRequiredDesktopBridge().authTokenGet();
        (requestInit.headers as Headers).set('authorization', jwt || '');
    });

    // This is an internal Clerk API used by Clerk's native SDKs.
    clerk.__unstable__onAfterResponse(
        async (_requestInit: FapiRequestInit, response?: FapiResponse<unknown>) => {
            const authHeader = response?.headers.get('authorization');
            if (authHeader) {
                await getRequiredDesktopBridge().authTokenSet(authHeader);
            }
        }
    );

    // A loaded window with no session (signed out, revoked) withdraws the handoff.
    clerk.addListener(({ session }) => {
        if (clerk.loaded && !session) {
            sessionShare.share(null);
        }
    });

    nativeClerk = clerk;
    return clerk;
}

/**
 * The session token another window shared while this window boots
 * (docs/api/auth.md, "Desktop session handoff"), read once; null without one.
 */
export function getNativeClerkSessionSeed(): ClerkSessionSeed | null {
    if (sessionSeed === undefined) {
        let peeked: unknown = null;
        try {
            peeked = getDesktopBridge()?.authSessionPeek?.() ?? null;
        } catch (error) {
            console.warn('[Clerk] Could not read the shared desktop session.', error);
        }
        sessionSeed = parseClerkSessionSeed(peeked, Date.now());
    }
    return sessionSeed;
}

/** The signed-in user: Clerk's once loaded, the handed-off session's before. */
export function getNativeClerkUserId(): string | null {
    if (nativeClerk?.loaded) {
        return nativeClerk.user?.id ?? null;
    }
    return getNativeClerkSessionSeed()?.userId ?? null;
}

/**
 * The current session token. Before Clerk loads, a still-live handed-off token
 * stands in; once spent, reads wait for Clerk. Every token Clerk hands out is
 * shared so the next booting window can start signed in.
 */
export async function getNativeClerkSessionToken(): Promise<string | null> {
    const clerk = nativeClerk;
    if (!clerk) {
        return null;
    }
    if (!clerk.loaded) {
        const seed = getNativeClerkSessionSeed();
        if (isUsableSeed(seed, Date.now())) {
            return seed.token;
        }
        await clerkSettled(clerk);
    }
    return await readSessionToken(clerk);
}

/** Every token Clerk hands a loaded window is shared, which also schedules its refresh. */
async function readSessionToken(
    clerk: Clerk,
    options?: { leewayInSeconds: number }
): Promise<string | null> {
    const token = (await clerk.session?.getToken(options)) ?? null;
    if (clerk.loaded) {
        sessionShare.share(token);
    }
    return token;
}

/** Resolves once Clerk has loaded or failed to. */
function clerkSettled(clerk: Clerk): Promise<void> {
    if (clerk.status !== 'loading') {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const onStatus = (status: string) => {
            if (status !== 'loading') {
                clerk.off('status', onStatus);
                resolve();
            }
        };
        clerk.on('status', onStatus);
    });
}

function getRequiredDesktopBridge() {
    const bridge = getDesktopBridge();
    if (!bridge) {
        throw new Error('Native Clerk requires the Haus desktop bridge.');
    }
    return bridge;
}
