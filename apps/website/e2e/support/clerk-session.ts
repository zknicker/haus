import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

export const e2eClerkUserId = 'user_e2e_human';
export const e2ePeerClerkUserId = 'user_e2e_peer';
/** The Clerk session `sessionToken` and `sessionRotatedToken` share. */
export const e2eClerkSessionId = 'sess_e2e_human';

/**
 * The identity the e2e humans carry. Production learns the name and address
 * from Clerk through `member.syncIdentity`; clerk-js never loads in e2e, so
 * the harness reports them on that same procedure (see `seedHumanIdentity`).
 */
export const e2eHumanEmail = 'e2e-human@haus.test';
export const e2ePeerEmail = 'e2e-peer@haus.test';
export const e2eHumanName = 'Ada Lovelace';

export function clerkSessionFile(runId = process.env.HAUS_E2E_RUN_ID ?? 'default') {
    return fileURLToPath(
        new URL(`../../../../.context/e2e/clerk-session-${runId}.json`, import.meta.url)
    );
}

export interface ClerkSessionFixture {
    databaseUrl: string;
    peerEmail: string;
    peerToken: string;
    rotatedToken: string;
    /** `token` with a Clerk session id; `sessionRotatedToken` is its in-place rotation. */
    sessionRotatedToken: string;
    sessionToken: string;
    token: string;
}

export function readClerkSessionFixture(): ClerkSessionFixture {
    return JSON.parse(readFileSync(clerkSessionFile(), 'utf8')) as ClerkSessionFixture;
}

/**
 * Signs the browser in as an e2e human. clerk-js never loads in e2e, so the
 * page carries the session token the local Clerk issuer minted for the Server
 * exactly where the App reads it. `peer` is a second real Clerk identity with
 * its own verified address, which membership flows need.
 */
export async function signInAsClerkHuman(
    page: Page,
    who: 'human' | 'peer' | 'human-session' = 'human'
) {
    const fixture = readClerkSessionFixture();
    const sessionToken = {
        human: fixture.token,
        'human-session': fixture.sessionToken,
        peer: fixture.peerToken,
    }[who];

    await page.addInitScript((value: string) => {
        let currentToken = value;
        Object.defineProperty(window, '__setE2eClerkSessionToken', {
            configurable: true,
            value: (nextToken: string) => {
                currentToken = nextToken;
            },
        });
        Object.defineProperty(window, 'Clerk', {
            configurable: true,
            value: { session: { getToken: () => Promise.resolve(currentToken) } },
        });
    }, sessionToken);
}
