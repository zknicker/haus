import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let serverId: string;

const computerId = 'cmp_1234567890123456';
const stormComputerId = 'cmp_abcdefghijklmnop';

beforeAll(async () => {
    harness = await startHausServerHarness();
    harness.humans.setVerifiedEmails('user_system_log_owner', ['owner@example.com']);
    owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_system_log_owner')
    );
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'System Log HQ',
            slug: 'system-log-hq',
        })
    ).id;
    const [ownerRow] = await harness.sql`
        select id from users where auth_subject = 'user_system_log_owner'
    `;
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash)
        values
            (${computerId}, ${serverId}, ${ownerRow.id}, ${'a'.repeat(64)}),
            (${stormComputerId}, ${serverId}, ${ownerRow.id}, ${'b'.repeat(64)})
    `;
    await harness.sql`
        insert into computer_system_events (id, computer_id, occurred_at, server_id, event_type)
        values
            ('cse_0000000000000001', ${computerId}, '2026-08-28T12:01:00Z', ${serverId}, 'connected'),
            ('cse_0000000000000002', ${computerId}, '2026-08-28T12:02:00Z', ${serverId}, 'connected'),
            ('cse_0000000000000003', ${computerId}, '2026-08-28T12:03:00Z', ${serverId}, 'connected'),
            ('cse_0000000000000004', ${computerId}, '2026-08-28T12:04:00Z', ${serverId}, 'connected'),
            ('cse_0000000000000005', ${computerId}, '2026-08-28T12:05:00Z', ${serverId}, 'connected'),
            ('cse_0000000000000006', ${computerId}, '2026-08-28T12:06:00Z', ${serverId}, 'connected'),
            ('cse_0000000000000007', ${computerId}, '2026-08-28T12:07:00Z', ${serverId}, 'connected'),
            ('cse_0000000000000008', ${computerId}, '2026-08-28T12:08:00Z', ${serverId}, 'connected')
    `;
    await harness.sql`
        insert into computer_system_events (
            id, computer_id, occurred_at, reason, server_id, event_type
        )
        values
            ('cse_storm00000000001', ${stormComputerId}, now(), 'socket-closed', ${serverId}, 'disconnected'),
            ('cse_storm00000000002', ${stormComputerId}, now(), 'socket-closed', ${serverId}, 'disconnected'),
            ('cse_storm00000000003', ${stormComputerId}, now(), 'socket-closed', ${serverId}, 'disconnected'),
            ('cse_storm00000000004', ${stormComputerId}, now(), 'socket-closed', ${serverId}, 'disconnected'),
            ('cse_storm00000000005', ${stormComputerId}, now(), 'socket-closed', ${serverId}, 'disconnected')
    `;
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test('Computer system log pages through the complete retained history', async () => {
    const firstPage = await owner.trpc.computer.systemLog.query({
        computerId,
        page: 1,
        serverId,
    });
    const secondPage = await owner.trpc.computer.systemLog.query({
        computerId,
        page: 2,
        serverId,
    });

    expect(firstPage).toMatchObject({ page: 1, pageSize: 6, total: 8 });
    expect(firstPage.events.map((event) => event.id)).toEqual([
        'cse_0000000000000008',
        'cse_0000000000000007',
        'cse_0000000000000006',
        'cse_0000000000000005',
        'cse_0000000000000004',
        'cse_0000000000000003',
    ]);
    expect(secondPage).toMatchObject({ page: 2, pageSize: 6, total: 8 });
    expect(secondPage.events.map((event) => event.id)).toEqual([
        'cse_0000000000000002',
        'cse_0000000000000001',
    ]);
});

test('Computer system log reports a recent disconnect storm independently of its page', async () => {
    const page = await owner.trpc.computer.systemLog.query({
        computerId: stormComputerId,
        page: 1,
        serverId,
    });

    expect(page.hasFrequentDisconnects).toBeTrue();
});
