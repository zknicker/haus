import { expect, test } from 'bun:test';
import {
    appSessionSchema,
    nativeAppSessionRequestSchema,
    nativeAppSessionSchema,
} from './app-session.ts';

const session = {
    accessToken: 'haus-access-fixture',
    expiresAt: '2026-10-31T04:00:00.000Z',
    issuedAt: '2026-10-31T03:59:00.000Z',
    sessionId: 'ses_fixture',
    user: {
        avatarId: null,
        displayName: 'Fixture',
        email: 'fixture@example.test',
        id: 'usr_fixture',
    },
};

test('App sessions carry the canonical Haus user and opaque access credential', () => {
    expect(appSessionSchema.parse(session)).toEqual(session);
    expect(() =>
        appSessionSchema.parse({ ...session, user: { ...session.user, id: 'user_clerk' } })
    ).toThrow();
});

test('renderer session responses refuse provider and resume credentials', () => {
    for (const key of ['refreshToken', 'sessionToken', 'cloudflareAccessToken']) {
        expect(() => appSessionSchema.parse({ ...session, [key]: 'private-fixture' })).toThrow();
    }
});

test('native sessions expose a separate resume credential only in their native envelope', () => {
    const native = {
        session,
        sessionExpiresAt: '2026-11-14T03:59:00.000Z',
        sessionToken: 'native-resume-fixture',
    };
    expect(nativeAppSessionSchema.parse(native)).toEqual(native);
    expect(nativeAppSessionRequestSchema.parse({ client: 'ios' })).toEqual({ client: 'ios' });
    expect(
        nativeAppSessionRequestSchema.parse({
            client: 'desktop',
            sessionToken: native.sessionToken,
        })
    ).toEqual({ client: 'desktop', sessionToken: native.sessionToken });
    expect(() =>
        nativeAppSessionRequestSchema.parse({ client: 'ios', userId: 'usr_other' })
    ).toThrow();
});
