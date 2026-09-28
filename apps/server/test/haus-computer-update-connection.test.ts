import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

const computerId = 'cmp_offlineupdate000';
let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = createHausClient(
        harness,
        await harness.clerk.mintSessionToken('clerk_offlineupdate_owner')
    );
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Offline Update',
            slug: 'offline-update',
        })
    ).id;
    const users = (await harness.sql`
        select id from users where clerk_user_id = 'clerk_offlineupdate_owner'
    `) as { id: string }[];
    const credentialHash = createHash('sha256').update('offline-update-credential').digest('hex');
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, product_version)
        values (${computerId}, ${serverId}, ${users[0]?.id}, ${credentialHash}, '4.2.0')
    `;
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test('an offline Computer cannot be checked or updated from its last reported version', async () => {
    for (const health of ['offline', 'healthy'] as const) {
        await harness.sql`update computers set health = ${health} where id = ${computerId}`;

        await expect(
            owner.trpc.computer.checkUpdate.mutate({ computerId, serverId })
        ).rejects.toThrow('Reconnect this Computer');
        await expect(owner.trpc.computer.update.mutate({ computerId, serverId })).rejects.toThrow(
            'Reconnect this Computer'
        );

        const rows = (await harness.sql`
            select update_phase from computers where id = ${computerId}
        `) as { update_phase: string }[];
        expect(rows[0]?.update_phase).toBe('idle');
    }
});
