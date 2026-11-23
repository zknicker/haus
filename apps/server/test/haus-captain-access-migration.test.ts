import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0154_captain-access';

test('0154 keeps computer use on only where it covered every Captain with access, and retires the list', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-captain-access-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const through = (idx: number) =>
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
            });
        await writeFile(journalPath, through(152));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedDevices(database);

        await writeFile(journalPath, through(153));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        expect(await readDevices(database)).toEqual([
            { enabled: false, id: 'cmp_allgrant00000000', redated: true, scope: 'selected' },
            { enabled: true, id: 'cmp_allhome000000000', redated: false, scope: 'selected' },
            { enabled: false, id: 'cmp_emptynamed000000', redated: true, scope: 'selected' },
            { enabled: true, id: 'cmp_equal00000000000', redated: false, scope: 'selected' },
            { enabled: false, id: 'cmp_missing000000000', redated: true, scope: 'selected' },
            { enabled: false, id: 'cmp_off0000000000000', redated: false, scope: 'selected' },
        ]);
        expect(await readGrantCount(database)).toEqual([{ count: 4 }]);
        expect(await readRetired(database)).toEqual([
            { computer_use_agents: null, trigger_count: 0 },
        ]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

const seededAt = '2026-11-01T00:00:00Z';

async function readDevices(database: SQL) {
    return await database`
        SELECT id, computer_use_enabled AS enabled, agent_access_scope AS scope,
            computer_use_changed_at > ${seededAt}::timestamptz AS redated
        FROM computers ORDER BY id COLLATE "C"`;
}

async function readGrantCount(database: SQL) {
    return await database`SELECT count(*)::int AS count FROM computer_agent_access`;
}

async function readRetired(database: SQL) {
    return await database`
        SELECT to_regclass('public.computer_use_agents')::text AS computer_use_agents,
            (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'agents_computer_use_moved') AS trigger_count`;
}

async function seedDevices(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_a', 'a', 'A')`;
        await tx`INSERT INTO computers (id, server_id, attached_by_user_id, credential_hash,
                computer_use_enabled, computer_use_scope, computer_use_changed_at)
            VALUES
                ('cmp_off0000000000000', 'srv_a', 'user_a', repeat('a', 64), false, 'all', ${seededAt}),
                ('cmp_equal00000000000', 'srv_a', 'user_a', repeat('b', 64), true, 'named', ${seededAt}),
                ('cmp_allgrant00000000', 'srv_a', 'user_a', repeat('c', 64), true, 'all', ${seededAt}),
                ('cmp_missing000000000', 'srv_a', 'user_a', repeat('d', 64), true, 'named', ${seededAt}),
                ('cmp_emptynamed000000', 'srv_a', 'user_a', repeat('e', 64), true, 'named', ${seededAt}),
                ('cmp_allhome000000000', 'srv_a', 'user_a', repeat('f', 64), true, 'all', ${seededAt})`;
        await tx`INSERT INTO task_keys (id, server_id, key) VALUES ('tky_web', 'srv_a', 'WEB')`;
        await tx`INSERT INTO chats (id, server_id, kind, name) VALUES ('cht_web', 'srv_a', 'channel', 'web')`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id) VALUES ('cht_web', 'srv_a', 'tky_web')`;
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone, computer_id,
                desired_runtime_id, desired_model_id, home_project_id)
            VALUES
                ('agt_off', 'srv_a', 'Off', 'off', 'UTC', 'cmp_off0000000000000', 'codex', 'gpt-5.6-sol', 'cht_web'),
                ('agt_equal', 'srv_a', 'Equal', 'equal', 'UTC', 'cmp_equal00000000000', 'codex', 'gpt-5.6-sol', 'cht_web'),
                ('agt_allgrant', 'srv_a', 'Allgrant', 'allgrant', 'UTC', 'cmp_allgrant00000000', 'codex', 'gpt-5.6-sol', 'cht_web'),
                ('agt_missing', 'srv_a', 'Missing', 'missing', 'UTC', 'cmp_missing000000000', 'codex', 'gpt-5.6-sol', 'cht_web'),
                ('agt_empty', 'srv_a', 'Empty', 'empty', 'UTC', 'cmp_emptynamed000000', 'codex', 'gpt-5.6-sol', 'cht_web'),
                ('agt_allhome', 'srv_a', 'Allhome', 'allhome', 'UTC', 'cmp_allhome000000000', 'codex', 'gpt-5.6-sol', 'cht_web')`;
        await tx`INSERT INTO computer_agent_access (server_id, computer_id, agent_id, granted_by_user_id)
            VALUES
                ('srv_a', 'cmp_off0000000000000', 'agt_equal', 'user_a'),
                ('srv_a', 'cmp_equal00000000000', 'agt_off', 'user_a'),
                ('srv_a', 'cmp_allgrant00000000', 'agt_equal', 'user_a'),
                ('srv_a', 'cmp_missing000000000', 'agt_equal', 'user_a')`;
        await tx`INSERT INTO computer_use_agents (server_id, computer_id, agent_id)
            VALUES
                ('srv_a', 'cmp_equal00000000000', 'agt_equal'),
                ('srv_a', 'cmp_equal00000000000', 'agt_off'),
                ('srv_a', 'cmp_missing000000000', 'agt_missing')`;
    });
}
