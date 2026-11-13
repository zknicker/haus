import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

/**
 * ADR 0051's rename over rows the previous schema wrote: the claim store keeps
 * its rows under the new names, and a queued or recorded task assignment keeps
 * its identity under the `claim_assignment` source and `claim-assign:` key.
 */
test('0118 renames tasks to claims and carries assignment deliveries across', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-rename-claims-'));
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
        await writeFile(journalPath, through(117));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);

        // Only the renamed rows matter; Server, Chat, and Agent foreign keys are skipped.
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO message_tasks
                (server_id, chat_id, message_id, number, origin, status, assignee_agent_id,
                 claimed_at, created_by_agent_id)
                VALUES ('srv_one', 'cht_one', 'msg_claim', 3, 'claimed', 'in_progress',
                    'agt_one', now(), 'agt_one')`;
            await tx`INSERT INTO message_task_labels (server_id, message_id, label_id)
                VALUES ('srv_one', 'msg_claim', 'lbl_one')`;
            await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key, source)
                VALUES
                    ('inb_assignment000001', 'srv_one', 'agt_two', 'cht_one',
                     '[Haus task assignment task=#3 target=#all assignedBy=@agent-one] Ship it',
                     'task-assign:msg_claim:2', 'task_assignment'),
                    ('inb_ordinary00000001', 'srv_one', 'agt_two', 'cht_one',
                     'Haus task assignment task=#3 is not an envelope', 'msg_plain', 'human')`;
            await tx`INSERT INTO agent_run_triggers (server_id, agent_id, run_id, chat_id, source, work_id)
                VALUES
                    ('srv_one', 'agt_two', 'run_assignment', 'cht_one', 'task_assignment',
                     'task-assign:msg_claim:2'),
                    ('srv_one', 'agt_two', 'run_ordinary', 'cht_one', 'human', 'msg_plain')`;
        });

        await writeFile(journalPath, through(118));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0118_rename-tasks-to-claims',
        ]);

        expect(
            await database`SELECT message_id, number, origin, status FROM message_claims`
        ).toEqual([
            { message_id: 'msg_claim', number: 3, origin: 'claimed', status: 'in_progress' },
        ]);
        expect(await database`SELECT message_id, label_id FROM message_claim_labels`).toEqual([
            { label_id: 'lbl_one', message_id: 'msg_claim' },
        ]);
        expect(
            await database`SELECT table_name FROM information_schema.tables
                WHERE table_name IN ('message_tasks', 'message_task_labels')`
        ).toEqual([]);
        expect(
            await database`SELECT column_name FROM information_schema.columns
                WHERE table_name = 'chats' AND column_name LIKE 'last_%_number'`
        ).toEqual([{ column_name: 'last_claim_number' }]);
        expect(
            await database`SELECT id, source, dedupe_key, content FROM agent_inbox ORDER BY id`
        ).toEqual([
            {
                content:
                    '[Haus claim assignment claim=#3 target=#all assignedBy=@agent-one] Ship it',
                dedupe_key: 'claim-assign:msg_claim:2',
                id: 'inb_assignment000001',
                source: 'claim_assignment',
            },
            {
                content: 'Haus task assignment task=#3 is not an envelope',
                dedupe_key: 'msg_plain',
                id: 'inb_ordinary00000001',
                source: 'human',
            },
        ]);
        expect(
            await database`SELECT run_id, source, work_id FROM agent_run_triggers ORDER BY run_id`
        ).toEqual([
            {
                run_id: 'run_assignment',
                source: 'claim_assignment',
                work_id: 'claim-assign:msg_claim:2',
            },
            { run_id: 'run_ordinary', source: 'human', work_id: 'msg_plain' },
        ]);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
