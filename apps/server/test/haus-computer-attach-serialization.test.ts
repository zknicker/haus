import { expect, test } from 'bun:test';
import { hashComputerSecret } from '../src/computers/service.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

test('Computer attach queued behind Admin removal reauthorizes before issuance', async () => {
    const harness = await startHausServerHarness();
    const owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_attach_serialize_owner')
    );
    const admin = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_attach_serialize_admin')
    );
    try {
        const server = await owner.trpc.server.create.mutate({
            displayName: 'Attach Serialize',
            slug: 'attach-serialize',
        });
        const adminHome = await admin.trpc.server.create.mutate({
            displayName: 'Attach Admin Home',
            slug: 'attach-admin-home',
        });
        await harness.sql`
            INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES (
                'mem_attach_serialize_admin',
                ${server.id},
                ${adminHome.viewerUserId},
                'admin'
            )
        `;
        const session = await createLoginSession(harness, admin);
        const idempotencyKey = `cak_serialize${'x'.repeat(34)}`;
        const input = {
            accessToken: session.accessToken,
            credentialHash: hashComputerSecret('credential-serialize'),
            idempotencyKey,
            slug: server.slug,
        };
        let removal: Promise<unknown> = Promise.resolve();
        let issuance: Promise<Response> = Promise.resolve(new Response());

        await whileServerRowIsHeld(harness, server.id, async () => {
            removal = owner.trpc.member.remove.mutate({
                confirmation: server.slug,
                serverId: server.id,
                userId: adminHome.viewerUserId,
            });
            await Bun.sleep(120);
            issuance = fetch(new URL('/computer/attach', harness.url), {
                body: JSON.stringify(input),
                headers: { 'content-type': 'application/json' },
                method: 'POST',
            });
            await Bun.sleep(120);
        });

        await expect(removal).resolves.toMatchObject({ userId: adminHome.viewerUserId });
        const response = await issuance;
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({
            code: 'computer_attachment_wrong_account',
        });
        const [stored] = await harness.sql`
            SELECT count(*)::int AS total
            FROM computers
            WHERE attachment_idempotency_key = ${idempotencyKey}
        `;
        expect(stored.total).toBe(0);
    } finally {
        admin.close();
        owner.close();
        await harness.close();
    }
}, 60_000);

async function createLoginSession(harness: HausServerHarness, client: HausClient) {
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
    return (await exchanged.json()) as { accessToken: string };
}

async function whileServerRowIsHeld(
    harness: HausServerHarness,
    serverId: string,
    run: () => Promise<void>
) {
    const holding = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const held = harness.sql.begin(async (tx: typeof harness.sql) => {
        await tx`SELECT id FROM servers WHERE id = ${serverId} FOR UPDATE`;
        holding.resolve();
        await release.promise;
    });
    await holding.promise;
    try {
        await run();
    } finally {
        release.resolve();
        await held;
    }
}
