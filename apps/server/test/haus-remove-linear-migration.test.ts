import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

// Production held Linear rows when 0108 first ran. Deleting the Linear connection queued a
// deferred check for `github_installations_connection_fk`, and the next ALTER TABLE on
// `mcp_connections` failed on the pending trigger event, rolling the whole release back.
test('removing Linear deletes its live rows and narrows the constraints', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-remove-linear-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const throughMigration = (idx: number) =>
            writeFile(
                journalPath,
                JSON.stringify({
                    ...journal,
                    entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
                })
            );
        await throughMigration(107);
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        // Only the touched tables matter; Server, Agent, and Chat foreign keys are skipped.
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO mcp_connections
                (id, server_id, name, url, auth, connected, header_names, tools, preset)
                VALUES
                    ('mcp_linear0000000000', 'srv_one', 'Linear', 'https://mcp.linear.app/mcp',
                     'oauth', true, '{}', '{list_issues}', 'linear'),
                    ('mcp_github0000000000', 'srv_one', 'GitHub', 'https://api.githubcopilot.com/mcp/',
                     'oauth', true, '{}', '{get_me}', 'github')`;
            await tx`INSERT INTO github_installations
                (id, server_id, connection_id, account_id, account_login, account_type, events,
                 installation_id, permissions, repository_selection, status, created_at,
                 synced_at, updated_at)
                VALUES ('ghi_installation0001', 'srv_one', 'mcp_github0000000000', 1, 'haus',
                    'Organization', '{issues}', 42, '{}'::jsonb, 'all', 'active', now(), now(),
                    now())`;
            await tx`INSERT INTO triggers
                (id, server_id, owner_agent_id, anchor_chat_id, kind, secret_hash, status, title,
                 created_at, updated_at)
                VALUES
                    ('trg_linear', 'srv_one', 'agt_cove', 'cht_dm', 'linear', null, 'armed',
                     'Issues', now(), now()),
                    ('trg_webhook', 'srv_one', 'agt_cove', 'cht_dm', 'webhook', 'hash', 'armed',
                     'Deploy', now(), now())`;
            await tx`INSERT INTO agent_inbox
                (id, server_id, agent_id, chat_id, source, content, dedupe_key)
                VALUES
                    ('inb_linearsession001', 'srv_one', 'agt_cove', 'cht_dm', 'linear_session',
                     'Linear session', 'linear-1'),
                    ('inb_linearautomated1', 'srv_one', 'agt_cove', 'cht_dm',
                     'linear_session_automated', 'Linear automation', 'linear-2'),
                    ('inb_dmmessage0000001', 'srv_one', 'agt_cove', 'cht_dm', 'dm', 'Hello',
                     'dm-1')`;
        });

        await throughMigration(109);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0108_remove-linear',
            '0109_freshness-hold-boundary',
        ]);
        expect(await database`SELECT id, preset FROM mcp_connections`).toEqual([
            { id: 'mcp_github0000000000', preset: 'github' },
        ]);
        expect(await database`SELECT id, connection_id FROM github_installations`).toEqual([
            { connection_id: 'mcp_github0000000000', id: 'ghi_installation0001' },
        ]);
        expect(await database`SELECT id, kind FROM triggers`).toEqual([
            { id: 'trg_webhook', kind: 'webhook' },
        ]);
        expect(await database`SELECT id FROM agent_inbox`).toEqual([
            { id: 'inb_dmmessage0000001' },
        ]);
        expect(
            await database`SELECT table_name FROM information_schema.tables
                WHERE table_name LIKE 'linear\_%'`
        ).toEqual([]);
        expect(
            await rejection(
                database`INSERT INTO mcp_connections
                    (id, server_id, name, url, auth, connected, header_names, tools, preset)
                    VALUES ('mcp_linearagain00000', 'srv_one', 'Linear', 'https://mcp.linear.app/mcp',
                        'oauth', false, '{}', '{}', 'linear')`
            )
        ).toMatch(/mcp_connections_preset/u);
        expect(
            await rejection(
                database`INSERT INTO triggers
                    (id, server_id, owner_agent_id, anchor_chat_id, kind, status, title,
                     created_at, updated_at)
                    VALUES ('trg_again', 'srv_one', 'agt_cove', 'cht_dm', 'linear', 'armed',
                        'Issues', now(), now())`
            )
        ).toMatch(/triggers_kind/u);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);

async function rejection(query: Promise<unknown>) {
    try {
        await query;
        return 'accepted';
    } catch (cause) {
        return String(cause);
    }
}
