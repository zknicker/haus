import { afterAll, beforeAll, expect, test } from 'bun:test';
import { canonicalizeAgentMessageContentForPersistence } from '../src/chats/canonicalize-agent-references.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let connection: HausConnection;

beforeAll(async () => {
    harness = await startHausServerHarness();
    connection = await connectHausDatabase(harness.databaseUrl);
    await harness.sql`
        insert into servers (id, slug, display_name) values
        ('srv_mentions', 'mentions', 'Mentions'), ('srv_elsewhere', 'elsewhere', 'Elsewhere')
    `;
    await harness.sql`
        insert into users (id, clerk_user_id) values
        ('usr_zach', 'clerk_zach'), ('usr_revoked', 'clerk_revoked'),
        ('usr_elsewhere', 'clerk_elsewhere'), ('usr_nohandle', 'clerk_nohandle')
    `;
    await harness.sql`
        insert into server_memberships (id, server_id, user_id, role, handle, revoked_at) values
        ('mem_zach', 'srv_mentions', 'usr_zach', 'owner', 'zach-knickerbocker', null),
        ('mem_revoked', 'srv_mentions', 'usr_revoked', 'member', 'revoked', now()),
        ('mem_elsewhere', 'srv_elsewhere', 'usr_elsewhere', 'owner', 'elsewhere', null),
        ('mem_nohandle', 'srv_mentions', 'usr_nohandle', 'member', null, null)
    `;
});

afterAll(async () => {
    await connection?.close();
    await harness?.close();
});

test('resolves only active humans in this Server and keeps retry identities after handle reuse', async () => {
    const content = 'Ask @zach-knickerbocker and @ZACH-KNICKERBOCKER, not @revoked or @elsewhere.';
    const input = { content, serverId: 'srv_mentions' };
    const stored = await canonicalizeAgentMessageContentForPersistence(connection.db, input);
    expect(stored).toBe(
        'Ask [@zach-knickerbocker](user://usr_zach) and [@ZACH-KNICKERBOCKER](user://usr_zach), not @revoked or @elsewhere.'
    );
    await harness.sql`update server_memberships set handle = 'zach-renamed' where id = 'mem_zach'`;
    await harness.sql`update server_memberships set handle = 'zach-knickerbocker' where id = 'mem_nohandle'`;
    await harness.sql`update server_memberships set revoked_at = null where id = 'mem_revoked'`;
    expect(
        await canonicalizeAgentMessageContentForPersistence(connection.db, {
            ...input,
            existingContent: stored,
        })
    ).toBe(stored);
    expect(
        await canonicalizeAgentMessageContentForPersistence(connection.db, {
            content: 'Ask @zach-knickerbocker.',
            serverId: 'srv_mentions',
        })
    ).toBe('Ask [@zach-knickerbocker](user://usr_nohandle).');
});
