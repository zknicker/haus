import { expect, test } from 'bun:test';
import { hashComputerSecret } from '../src/computers/service.ts';
import { createHausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

interface ComputerLoginSession {
    accessToken: string;
    accessTokenExpiresAt: string;
    origin: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
    sessionId: string;
}

interface AttachedComputer {
    computerId: string;
    idempotent: boolean;
    serverId: string;
    slug: string;
}

async function createServer(harness: HausServerHarness, subject: string, slug: string) {
    const client = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    try {
        return await client.trpc.server.create.mutate({
            displayName: slug,
            slug,
        });
    } finally {
        client.close();
    }
}

async function createLoginSession(
    harness: HausServerHarness,
    subject: string
): Promise<ComputerLoginSession> {
    const client = createHausClient(harness, await harness.humans.mintSessionToken(subject));
    try {
        const started = await fetch(new URL('/computer/login', harness.url), {
            body: JSON.stringify({ origin: harness.url.origin }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        const grant = (await started.json()) as { deviceCode: string; userCode: string };
        await client.trpc.computer.login.approve.mutate({ userCode: grant.userCode });
        const exchanged = await fetch(new URL('/computer/login/poll', harness.url), {
            body: JSON.stringify({ deviceCode: grant.deviceCode }),
            headers: { 'content-type': 'application/json' },
            method: 'POST',
        });
        expect(exchanged.status).toBe(200);
        return (await exchanged.json()) as ComputerLoginSession;
    } finally {
        client.close();
    }
}

async function attach(
    harness: HausServerHarness,
    input: {
        accessToken: string;
        credentialHash: string;
        idempotencyKey: string;
        slug: string;
    }
) {
    return await fetch(new URL('/computer/attach', harness.url), {
        body: JSON.stringify(input),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
}

function attachInput(session: ComputerLoginSession, slug: string, suffix = slug) {
    const credential = `credential-${suffix}`;
    return {
        accessToken: session.accessToken,
        credentialHash: hashComputerSecret(credential),
        idempotencyKey: `cak_${suffix}${'x'.repeat(43 - suffix.length)}`,
        slug,
    };
}

test('Computer attach allows an Owner and keeps the human login separate from execution', async () => {
    const harness = await startHausServerHarness();
    try {
        const server = await createServer(harness, 'user_attach_owner', 'attach-owner');
        const session = await createLoginSession(harness, 'user_attach_owner');
        const input = attachInput(session, server.slug, 'owner');

        const response = await attach(harness, input);

        expect(response.status).toBe(200);
        const result = (await response.json()) as AttachedComputer & Record<string, unknown>;
        expect(result).toMatchObject({
            idempotent: false,
            serverId: server.id,
            slug: server.slug,
        });
        expect(result.computerId).toMatch(/^cmp_[A-Za-z0-9_-]{16}$/u);
        expect(result).not.toHaveProperty('credential');
        expect(result).not.toHaveProperty('accessToken');

        const [row] = await harness.sql`
            SELECT attached_by_user_id, credential_hash, attachment_idempotency_key
            FROM computers
            WHERE id = ${result.computerId}
        `;
        expect(row).toMatchObject({
            attached_by_user_id: server.viewerUserId,
            credential_hash: input.credentialHash,
            attachment_idempotency_key: input.idempotencyKey,
        });
    } finally {
        await harness.close();
    }
}, 60_000);

test('Computer attach returns the same attachment after a crash and concurrent retry', async () => {
    const harness = await startHausServerHarness();
    try {
        const server = await createServer(harness, 'user_attach_retry', 'attach-retry');
        const session = await createLoginSession(harness, 'user_attach_retry');
        const input = attachInput(session, server.slug, 'retry');

        const first = await attach(harness, input);
        expect(first.status).toBe(200);
        const issued = (await first.json()) as AttachedComputer;
        expect(issued.idempotent).toBe(false);

        const retry = await attach(harness, input);
        expect(retry.status).toBe(200);
        expect(await retry.json()).toEqual({ ...issued, idempotent: true });

        const concurrentInput = attachInput(session, server.slug, 'concurrent');
        const concurrent = await Promise.all([
            attach(harness, concurrentInput),
            attach(harness, concurrentInput),
        ]);
        expect(concurrent.map((response) => response.status)).toEqual([200, 200]);
        const concurrentResults = await Promise.all(
            concurrent.map((response) => response.json() as Promise<AttachedComputer>)
        );
        expect(new Set(concurrentResults.map((result) => result.computerId)).size).toBe(1);
        expect(new Set(concurrentResults.map((result) => result.idempotent))).toEqual(
            new Set([false, true])
        );

        const rows = await harness.sql`
            SELECT id, attachment_idempotency_key
            FROM computers
            WHERE server_id = ${server.id}
            ORDER BY created_at
        `;
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.attachment_idempotency_key)).toEqual([
            input.idempotencyKey,
            concurrentInput.idempotencyKey,
        ]);
    } finally {
        await harness.close();
    }
}, 60_000);

test('Computer attach reports missing Server, wrong account, and insufficient role directly', async () => {
    const harness = await startHausServerHarness();
    try {
        const ownerServer = await createServer(harness, 'user_attach_auth_owner', 'attach-auth');
        const ownerSession = await createLoginSession(harness, 'user_attach_auth_owner');
        const missing = await attach(harness, {
            ...attachInput(ownerSession, 'missing-server', 'missing'),
            slug: 'missing-server',
        });
        expect(missing.status).toBe(404);
        expect(await missing.json()).toMatchObject({
            code: 'computer_attachment_server_not_found',
        });

        const wrongAccount = await attach(
            harness,
            attachInput(
                await createLoginSession(harness, 'user_attach_wrong_account'),
                ownerServer.slug,
                'wrong'
            )
        );
        expect(wrongAccount.status).toBe(403);
        expect(await wrongAccount.json()).toMatchObject({
            code: 'computer_attachment_wrong_account',
            error: expect.stringContaining('login --replace'),
        });

        const memberServer = await createServer(harness, 'user_attach_member', 'member-home');
        await harness.sql`
            INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_attach_member', ${ownerServer.id}, ${memberServer.viewerUserId}, 'member')
        `;
        const insufficient = await attach(
            harness,
            attachInput(
                await createLoginSession(harness, 'user_attach_member'),
                ownerServer.slug,
                'member'
            )
        );
        expect(insufficient.status).toBe(403);
        expect(await insufficient.json()).toMatchObject({
            code: 'computer_attachment_insufficient_role',
            error: expect.stringContaining('Owner or Admin'),
        });
    } finally {
        await harness.close();
    }
}, 60_000);

test('Computer attach accepts an Admin and isolates multiple Server credentials', async () => {
    const harness = await startHausServerHarness();
    try {
        const first = await createServer(harness, 'user_attach_admin', 'attach-first');
        const second = await createServer(harness, 'user_attach_admin', 'attach-second');
        await harness.sql`
            UPDATE server_memberships
            SET role = 'admin'
            WHERE server_id = ${first.id} AND user_id = ${first.viewerUserId}
        `;
        const session = await createLoginSession(harness, 'user_attach_admin');
        const firstInput = attachInput(session, first.slug, 'first');
        const secondInput = attachInput(session, second.slug, 'second');

        const [firstResponse, secondResponse] = await Promise.all([
            attach(harness, firstInput),
            attach(harness, secondInput),
        ]);
        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        const [firstResult, secondResult] = (await Promise.all([
            firstResponse.json(),
            secondResponse.json(),
        ])) as [AttachedComputer, AttachedComputer];
        expect(firstResult.computerId).not.toBe(secondResult.computerId);

        const rows = await harness.sql`
            SELECT server_id, credential_hash
            FROM computers
            WHERE id IN (${firstResult.computerId}, ${secondResult.computerId})
            ORDER BY server_id
        `;
        expect(rows).toHaveLength(2);
        expect(rows[0]?.credential_hash).not.toBe(rows[1]?.credential_hash);
        expect(rows.map((row) => row.server_id).sort()).toEqual([first.id, second.id].sort());
    } finally {
        await harness.close();
    }
}, 60_000);
