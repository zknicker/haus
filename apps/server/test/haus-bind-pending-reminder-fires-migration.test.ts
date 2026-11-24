import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0157 counts every pending script fire as sent to its Agent’s current Computer', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-bind-pending-fires-'));
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
        await writeFile(journalPath, through(155));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seed(database);

        await writeFile(journalPath, through(156));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0157_bind-pending-reminder-fires',
        ]);

        expect(
            await database`SELECT id, dispatched_computer_id AS computer,
                    dispatched_placement_generation AS generation
                FROM reminder_agent_attention ORDER BY id`
        ).toEqual([
            { computer: 'cmp_mini', generation: 3, id: 'att_live' },
            { computer: null, generation: null, id: 'att_plain' },
            { computer: null, generation: null, id: 'att_retired' },
        ]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seed(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone,
                home_project_id, computer_id, desired_runtime_id, desired_model_id,
                placement_generation)
            VALUES ('agt_live', 'srv_a', 'Cove', 'cove', 'UTC', 'prj_a', 'cmp_mini', 'codex',
                'gpt-5.6-sol', 3)`;
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone,
                retired_at)
            VALUES ('agt_retired', 'srv_a', 'Old', 'old', 'UTC', now())`;
        await tx`INSERT INTO reminder_agent_attention (id, server_id, agent_id, anchor_chat_id,
                fire_id, attention_kind, queued_at, reminder_id, script)
            VALUES
                ('att_live', 'srv_a', 'agt_live', 'cht_a', 'fire_live', 'reminder_script', now(),
                    'rem_a', 'printf hi'),
                ('att_retired', 'srv_a', 'agt_retired', 'cht_a', 'fire_retired', 'reminder_script',
                    now(), 'rem_b', 'printf hi')`;
        await tx`INSERT INTO reminder_agent_attention (id, server_id, agent_id, anchor_chat_id,
                fire_id, attention_kind, queued_at, reminder_id)
            VALUES ('att_plain', 'srv_a', 'agt_live', 'cht_a', 'fire_plain', 'reminder', now(),
                'rem_c')`;
    });
}
