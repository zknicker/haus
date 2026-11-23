import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0156 leaves pending script fires unbound and binds a Computer only with its generation', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-reminder-script-placement-'));
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
        await writeFile(journalPath, through(154));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO reminder_agent_attention (id, server_id, agent_id, anchor_chat_id,
                    fire_id, attention_kind, queued_at, reminder_id, script)
                VALUES ('att_a', 'srv_a', 'agt_a', 'cht_a', 'fire_a', 'reminder_script', now(),
                    'rem_a', 'printf hi')`;
        });

        await writeFile(journalPath, through(155));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0156_reminder-script-placement',
        ]);

        expect(
            await database`SELECT dispatched_computer_id, dispatched_placement_generation
                FROM reminder_agent_attention`
        ).toEqual([{ dispatched_computer_id: null, dispatched_placement_generation: null }]);
        expect(
            await database`SELECT conname FROM pg_constraint
                WHERE conname = 'reminder_agent_attention_dispatch'`
        ).toEqual([{ conname: 'reminder_agent_attention_dispatch' }]);
        await database`UPDATE reminder_agent_attention
            SET dispatched_computer_id = 'cmp_a', dispatched_placement_generation = 0`;
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});
