import { readFileSync } from 'node:fs';
import type { AppSession } from '@haus/api/app-session';
import type { Page } from '@playwright/test';
import { createAppSessionFixture as createServerSession } from '../../../server/test/app-session-fixture.ts';
import { serverStateFile } from './server-state.ts';

export const e2eHumanUserId = 'usr_e2e_human';
export const e2ePeerUserId = 'usr_e2e_peer';
export const e2eHumanEmail = 'e2e-human@haus.test';
export const e2ePeerEmail = 'e2e-peer@haus.test';
export const e2eHumanName = 'Ada Lovelace';

export type E2eIdentity = 'human' | 'peer';

export interface AppTestFixture {
    accessToken: string;
    databaseUrl: string;
    email: string;
    session: AppSession;
    userId: string;
}

export async function createAppTestFixture(who: E2eIdentity = 'human'): Promise<AppTestFixture> {
    const serverState = JSON.parse(readFileSync(serverStateFile(), 'utf8')) as {
        databaseUrl: string;
    };
    assertLoopbackTestDatabase(serverState.databaseUrl);
    const identity =
        who === 'human'
            ? {
                  displayName: e2eHumanName,
                  email: e2eHumanEmail,
                  subject: 'haus-e2e-human',
                  userId: e2eHumanUserId,
              }
            : {
                  displayName: 'Grace Hopper',
                  email: e2ePeerEmail,
                  subject: 'haus-e2e-peer',
                  userId: e2ePeerUserId,
              };
    const issued = await createServerSession({
        accessLifetimeSeconds: 3600,
        databaseUrl: serverState.databaseUrl,
        displayName: identity.displayName,
        subject: identity.subject,
        userId: identity.userId,
        verifiedEmails: [identity.email],
    });
    return {
        accessToken: issued.session.accessToken,
        databaseUrl: serverState.databaseUrl,
        email: identity.email,
        session: issued.session,
        userId: identity.userId,
    };
}

function assertLoopbackTestDatabase(value: string) {
    const url = new URL(value);
    if (
        !['postgres:', 'postgresql:'].includes(url.protocol) ||
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/haus_test' ||
        url.password
    ) {
        throw new Error('E2E App sessions require the isolated loopback test database.');
    }
}

/** The test runner injects a real Server AppSession into the loopback renderer in memory. */
export async function signInAsAppHuman(page: Page, who: E2eIdentity = 'human') {
    const fixture = await createAppTestFixture(who);
    await page.addInitScript((session: AppSession) => {
        Object.defineProperty(window, '__hausE2eAppSession', {
            configurable: true,
            writable: true,
            value: session,
        });
    }, fixture.session);
    return fixture;
}
