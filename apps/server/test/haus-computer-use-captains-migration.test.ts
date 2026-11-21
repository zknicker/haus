import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0150_computer-use-captains';

test('0150 dates every existing switch, lets all Captains in, and drops a moved Captain from a named list', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-computer-use-captains-'));
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
        await writeFile(journalPath, through(149));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedComputers(database);

        await writeFile(journalPath, through(150));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        expect(await readSwitches(database)).toEqual([
            { computer_use_enabled: true, dated: true, id: 'cmp_aaaaaaaaaaaaaaaa', scope: 'all' },
            { computer_use_enabled: false, dated: true, id: 'cmp_bbbbbbbbbbbbbbbb', scope: 'all' },
        ]);

        await database`UPDATE computers SET computer_use_scope = 'named' WHERE id = 'cmp_aaaaaaaaaaaaaaaa'`;
        await database`INSERT INTO computer_use_agents (server_id, computer_id, agent_id)
            VALUES ('srv_a', 'cmp_aaaaaaaaaaaaaaaa', 'agt_mover'), ('srv_a', 'cmp_aaaaaaaaaaaaaaaa', 'agt_stayer')`;
        await database`UPDATE agents SET display_name = 'Renamed' WHERE id = 'agt_mover'`;
        expect(await readListed(database)).toEqual([
            { agent_id: 'agt_mover' },
            { agent_id: 'agt_stayer' },
        ]);
        await database`UPDATE agents SET computer_id = 'cmp_bbbbbbbbbbbbbbbb' WHERE id = 'agt_mover'`;
        expect(await readListed(database)).toEqual([{ agent_id: 'agt_stayer' }]);
        await database`DELETE FROM agents WHERE id = 'agt_stayer'`;
        expect(await readListed(database)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function readSwitches(database: SQL) {
    return await database`
        SELECT id, computer_use_enabled, computer_use_changed_at IS NOT NULL AS dated,
            computer_use_scope AS scope
        FROM computers ORDER BY id COLLATE "C"`;
}

async function readListed(database: SQL) {
    return await database`SELECT agent_id FROM computer_use_agents ORDER BY agent_id COLLATE "C"`;
}

async function seedComputers(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_a', 'a', 'A')`;
        await tx`INSERT INTO computers (id, server_id, attached_by_user_id, credential_hash,
                computer_use_enabled)
            VALUES
                ('cmp_aaaaaaaaaaaaaaaa', 'srv_a', 'user_a', repeat('a', 64), true),
                ('cmp_bbbbbbbbbbbbbbbb', 'srv_a', 'user_a', repeat('b', 64), false)`;
        await tx`INSERT INTO task_keys (id, server_id, key) VALUES ('tky_web', 'srv_a', 'WEB')`;
        await tx`INSERT INTO chats (id, server_id, kind, name) VALUES ('cht_web', 'srv_a', 'channel', 'web')`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id) VALUES ('cht_web', 'srv_a', 'tky_web')`;
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone, computer_id,
                desired_runtime_id, desired_model_id, home_project_id)
            VALUES
                ('agt_mover', 'srv_a', 'Mover', 'mover', 'UTC', 'cmp_aaaaaaaaaaaaaaaa', 'codex', 'gpt-5.6-sol', 'cht_web'),
                ('agt_stayer', 'srv_a', 'Stayer', 'stayer', 'UTC', 'cmp_aaaaaaaaaaaaaaaa', 'codex', 'gpt-5.6-sol', 'cht_web')`;
    });
}
