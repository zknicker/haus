import { expect, test } from 'bun:test';
import { hashComputerSecret } from '../src/computers/service.ts';
import { createHausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

interface DeviceGrant {
    deviceCode: string;
    expiresAt: string;
    pollingIntervalMs: number;
    userCode: string;
    verificationUrl: string;
}

interface ComputerLoginSession {
    accessToken: string;
    accessTokenExpiresAt: string;
    origin: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
    sessionId: string;
}

async function beginLogin(
    harness: HausServerHarness,
    purpose: 'login' | 'setup' = 'login'
): Promise<DeviceGrant> {
    const response = await fetch(new URL('/computer/login', harness.url), {
        body: JSON.stringify({ origin: harness.url.origin, purpose }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(response.status).toBe(200);
    return (await response.json()) as DeviceGrant;
}

async function pollLogin(harness: HausServerHarness, deviceCode: string) {
    return await fetch(new URL('/computer/login/poll', harness.url), {
        body: JSON.stringify({ deviceCode }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
}

async function completeLogin(harness: HausServerHarness, accessToken: string) {
    return await fetch(new URL('/computer/login/complete', harness.url), {
        body: JSON.stringify({ accessToken }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
}

async function createLoginSession(
    harness: HausServerHarness,
    subject: string,
    complete = true
): Promise<ComputerLoginSession> {
    const client = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    try {
        const started = await beginLogin(harness);
        await client.trpc.computer.login.approve.mutate({ userCode: started.userCode });
        const exchanged = await pollLogin(harness, started.deviceCode);
        expect(exchanged.status).toBe(200);
        const session = (await exchanged.json()) as ComputerLoginSession & { status: string };
        expect(session.status).toBe('approved');
        if (complete) {
            const completed = await completeLogin(harness, session.accessToken);
            expect(completed.status).toBe(200);
        }
        return session;
    } finally {
        client.close();
    }
}

async function postLoginRoute(
    harness: HausServerHarness,
    path: string,
    body: object
): Promise<Response> {
    return await fetch(new URL(path, harness.url), {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
}

test('superseded one-off Computer setup routes are unavailable', async () => {
    const harness = await startHausServerHarness();

    try {
        const begin = await fetch(new URL('/computer/setup', harness.url), {
            body: JSON.stringify({
                credentialHash: 'a'.repeat(64),
                slug: 'retired-setup',
            }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        const status = await fetch(
            new URL(`/computer/setup/cap_${'a'.repeat(16)}?secret=${'s'.repeat(32)}`, harness.url)
        );

        expect(begin.status).toBe(404);
        expect(status.status).toBe(404);
    } finally {
        await harness.close();
    }
});

test('Computer login grants approve without Server membership and exchange once', async () => {
    const harness = await startHausServerHarness();
    const client = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_device_login')
    );

    try {
        const started = await beginLogin(harness);
        expect(started.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/u);
        expect(started.deviceCode).toHaveLength(43);
        expect(started.pollingIntervalMs).toBeGreaterThan(0);
        expect(new URL(started.verificationUrl)).toMatchObject({
            host: new URL(harness.appOrigin).host,
            pathname: '/computer/login',
        });

        const pending = await pollLogin(harness, started.deviceCode);
        expect(pending.status).toBe(200);
        expect(await pending.json()).toMatchObject({
            pollingIntervalMs: started.pollingIntervalMs,
            status: 'pending',
        });

        expect(
            await client.trpc.computer.login.status.query({ userCode: started.userCode })
        ).toEqual({ status: 'pending' });
        expect(
            await client.trpc.computer.login.approve.mutate({ userCode: started.userCode })
        ).toEqual({ status: 'approved' });
        expect(
            await client.trpc.computer.login.status.query({ userCode: started.userCode })
        ).toEqual({ status: 'approved' });

        const exchanged = await pollLogin(harness, started.deviceCode);
        expect(exchanged.status).toBe(200);
        const session = (await exchanged.json()) as Record<string, string>;
        expect(session).toMatchObject({
            origin: harness.url.origin,
            status: 'approved',
        });
        expect(session.accessToken).toMatch(/^gcl_at_/u);
        expect(session.refreshToken).toMatch(/^gcl_rt_/u);
        expect(session.sessionId).toMatch(/^cls_[A-Za-z0-9_-]{16}$/u);
        expect(session.accessTokenExpiresAt).toEqual(expect.any(String));
        expect(session.refreshTokenExpiresAt).toEqual(expect.any(String));

        expect(
            await client.trpc.computer.login.status.query({ userCode: started.userCode })
        ).toEqual({ status: 'approved' });

        const completed = await completeLogin(harness, session.accessToken);
        expect(completed.status).toBe(200);
        expect(await completed.json()).toEqual({ status: 'completed' });
        expect(
            await client.trpc.computer.login.status.query({ userCode: started.userCode })
        ).toEqual({ status: 'consumed' });

        const consumed = await pollLogin(harness, started.deviceCode);
        expect(consumed.status).toBe(409);
        expect(await consumed.json()).toMatchObject({ code: 'computer_login_consumed' });

        const rows = await harness.sql`
            SELECT origin, auth_subject, access_token_hash, refresh_token_hash, stored_at
            FROM computer_login_sessions
        `;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            auth_subject: 'user_device_login',
            origin: harness.url.origin,
        });
        expect(rows[0].access_token_hash).not.toContain(session.accessToken);
        expect(rows[0].refresh_token_hash).not.toContain(session.refreshToken);
        expect(rows[0].stored_at).toBeInstanceOf(Date);
    } finally {
        client.close();
        await harness.close();
    }
}, 60_000);

test('Computer login exchange serializes concurrent polling to one session', async () => {
    const harness = await startHausServerHarness();
    const client = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_concurrent_login')
    );

    try {
        const started = await beginLogin(harness);
        await client.trpc.computer.login.approve.mutate({ userCode: started.userCode });

        const responses = await Promise.all([
            pollLogin(harness, started.deviceCode),
            pollLogin(harness, started.deviceCode),
        ]);
        expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
        const terminal = responses.find((response) => response.status === 409);
        expect(terminal).toBeDefined();
        expect(await terminal?.json()).toMatchObject({ code: 'computer_login_consumed' });
        expect((await harness.sql`SELECT id FROM computer_login_sessions`).length).toBe(1);
    } finally {
        client.close();
        await harness.close();
    }
}, 60_000);

test('setup login stays finishing until the Computer acknowledges durable attachment storage', async () => {
    const harness = await startHausServerHarness();
    const client = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_setup_login')
    );

    try {
        const started = await beginLogin(harness, 'setup');
        expect(new URL(started.verificationUrl).searchParams.get('flow')).toBeNull();
        await client.trpc.computer.login.approve.mutate({ userCode: started.userCode });
        const exchanged = await pollLogin(harness, started.deviceCode);
        expect(exchanged.status).toBe(200);
        const session = (await exchanged.json()) as ComputerLoginSession & { status: string };

        expect(
            await client.trpc.computer.login.status.query({ userCode: started.userCode })
        ).toEqual({ purpose: 'setup', status: 'approved' });

        const completed = await completeLogin(harness, session.accessToken);
        expect(completed.status).toBe(200);
        expect(
            await client.trpc.computer.login.status.query({ userCode: started.userCode })
        ).toEqual({ purpose: 'setup', status: 'consumed' });
    } finally {
        client.close();
        await harness.close();
    }
}, 60_000);

test('Computer login reports malformed, denied, and expired terminal states', async () => {
    const harness = await startHausServerHarness();
    const client = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_denied_login')
    );
    const anonymous = createHausClient(harness);

    try {
        expect(await anonymous.trpc.computer.login.status.query({ userCode: 'bad' })).toEqual({
            status: 'malformed',
        });
        expect(await anonymous.trpc.computer.login.status.query({ userCode: 'ABCD-EFGH' })).toEqual(
            { status: 'not-found' }
        );

        const malformedPoll = await pollLogin(harness, 'bad');
        expect(malformedPoll.status).toBe(400);
        expect(await malformedPoll.json()).toMatchObject({ code: 'computer_login_malformed' });

        const denied = await beginLogin(harness);
        expect(await client.trpc.computer.login.deny.mutate({ userCode: denied.userCode })).toEqual(
            { status: 'denied' }
        );
        const deniedPoll = await pollLogin(harness, denied.deviceCode);
        expect(deniedPoll.status).toBe(403);
        expect(await deniedPoll.json()).toMatchObject({ code: 'computer_login_denied' });

        const expired = await beginLogin(harness);
        await harness.sql`
            UPDATE computer_login_grants
            SET expires_at = now() - interval '1 second'
            WHERE user_code_hash = ${hashComputerSecret(expired.userCode.replace('-', ''))}
        `;
        expect(
            await anonymous.trpc.computer.login.status.query({ userCode: expired.userCode })
        ).toEqual({ status: 'expired' });
        const expiredPoll = await pollLogin(harness, expired.deviceCode);
        expect(expiredPoll.status).toBe(410);
        expect(await expiredPoll.json()).toMatchObject({ code: 'computer_login_expired' });
    } finally {
        anonymous.close();
        client.close();
        await harness.close();
    }
}, 60_000);

test('Computer login rotates access and refresh credentials atomically', async () => {
    const harness = await startHausServerHarness();
    try {
        const session = await createLoginSession(harness, 'user_refresh_rotation');
        const response = await postLoginRoute(harness, '/computer/login/refresh', {
            refreshToken: session.refreshToken,
            sessionId: session.sessionId,
        });

        expect(response.status).toBe(200);
        const rotated = (await response.json()) as ComputerLoginSession & { status: string };
        expect(rotated).toMatchObject({
            origin: session.origin,
            sessionId: session.sessionId,
            status: 'refreshed',
        });
        expect(rotated.accessToken).not.toBe(session.accessToken);
        expect(rotated.refreshToken).not.toBe(session.refreshToken);

        const rows = await harness.sql`
            SELECT token_hash, consumed_at, revoked_at
            FROM computer_login_refresh_tokens
            ORDER BY created_at
        `;
        expect(rows).toHaveLength(2);
        expect(rows[0]?.token_hash).not.toContain(session.refreshToken);
        expect(rows[0]?.consumed_at).toBeInstanceOf(Date);
        expect(rows[0]?.revoked_at).toBeNull();
        expect(rows[1]?.token_hash).not.toContain(rotated.refreshToken);
        expect(rows[1]?.consumed_at).toBeNull();
        expect(rows[1]?.revoked_at).toBeNull();
    } finally {
        await harness.close();
    }
}, 60_000);

test('Computer login refresh-token reuse revokes the whole family', async () => {
    const harness = await startHausServerHarness();
    try {
        const session = await createLoginSession(harness, 'user_refresh_reuse');
        const first = await postLoginRoute(harness, '/computer/login/refresh', {
            refreshToken: session.refreshToken,
            sessionId: session.sessionId,
        });
        expect(first.status).toBe(200);
        const rotated = (await first.json()) as ComputerLoginSession;

        const reused = await postLoginRoute(harness, '/computer/login/refresh', {
            refreshToken: session.refreshToken,
            sessionId: session.sessionId,
        });
        expect(reused.status).toBe(409);
        expect(await reused.json()).toMatchObject({ code: 'computer_login_refresh_reused' });

        const sessionRows = await harness.sql`
            SELECT revoked_at FROM computer_login_sessions WHERE id = ${session.sessionId}
        `;
        expect(sessionRows[0]?.revoked_at).toBeInstanceOf(Date);
        const tokenRows = await harness.sql`
            SELECT revoked_at
            FROM computer_login_refresh_tokens
            WHERE session_id = ${session.sessionId}
        `;
        expect(tokenRows).toHaveLength(2);
        expect(tokenRows.every((row) => row.revoked_at instanceof Date)).toBe(true);

        const afterReuse = await postLoginRoute(harness, '/computer/login/refresh', {
            refreshToken: rotated.refreshToken,
            sessionId: session.sessionId,
        });
        expect(afterReuse.status).toBe(401);
        expect(await afterReuse.json()).toMatchObject({ code: 'computer_login_revoked' });
    } finally {
        await harness.close();
    }
}, 60_000);

test('Computer management authority is inspectable but cannot access Agent execution', async () => {
    const harness = await startHausServerHarness();
    try {
        const session = await createLoginSession(harness, 'user_management_scope');
        const inspected = await postLoginRoute(harness, '/computer/login/inspect', {
            accessToken: session.accessToken,
        });
        expect(inspected.status).toBe(200);
        expect(await inspected.json()).toEqual({
            accessTokenExpiresAt: session.accessTokenExpiresAt,
            origin: session.origin,
            refreshTokenExpiresAt: session.refreshTokenExpiresAt,
            scope: 'computer-management',
            sessionId: session.sessionId,
            status: 'active',
        });

        const agentSurface = await fetch(new URL('/api/agent/server', harness.url), {
            headers: { authorization: `Bearer ${session.accessToken}` },
        });
        expect(agentSurface.status).toBe(401);
        expect(await agentSurface.json()).toMatchObject({ code: 'MISSING_TOKEN' });
    } finally {
        await harness.close();
    }
}, 60_000);

test('Computer logout revokes idempotently and rejects a late persistence acknowledgement', async () => {
    const harness = await startHausServerHarness();
    try {
        const session = await createLoginSession(harness, 'user_logout', false);
        const revoked = await postLoginRoute(harness, '/computer/login/revoke', {
            refreshToken: session.refreshToken,
            sessionId: session.sessionId,
        });
        expect(revoked.status).toBe(200);
        expect(await revoked.json()).toEqual({ status: 'revoked' });

        const repeated = await postLoginRoute(harness, '/computer/login/revoke', {
            refreshToken: session.refreshToken,
            sessionId: session.sessionId,
        });
        expect(repeated.status).toBe(200);
        expect(await repeated.json()).toEqual({ status: 'revoked' });

        const completed = await completeLogin(harness, session.accessToken);
        expect(completed.status).toBe(401);
        expect(await completed.json()).toMatchObject({ code: 'computer_login_revoked' });
        const rows = await harness.sql`
            SELECT stored_at FROM computer_login_sessions WHERE id = ${session.sessionId}
        `;
        expect(rows[0]?.stored_at).toBeNull();
    } finally {
        await harness.close();
    }
}, 60_000);
