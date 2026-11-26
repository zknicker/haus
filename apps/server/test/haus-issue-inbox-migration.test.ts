import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0162 deletes old task_assignment rows, then makes Issue items chatless', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-issue-inbox-'));
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
        await writeFile(journalPath, through(160));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedTaskAssignments(database);

        await writeFile(journalPath, through(161));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0162_issue-inbox',
        ]);
        expect(await database`SELECT dedupe_key FROM agent_inbox ORDER BY dedupe_key`).toEqual([
            { dedupe_key: 'subagent:agt_one:wake_1' },
        ]);
        expect(await database`SELECT run_id FROM agent_run_triggers ORDER BY run_id`).toEqual([
            { run_id: 'run_subagent' },
        ]);

        const insert = (id: string, source: string, chatId: string | null) =>
            database.begin(async (tx) => {
                await tx`SET LOCAL session_replication_role = replica`;
                await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content,
                        dedupe_key, source)
                    VALUES (${id}, 'srv_one', 'agt_one', ${chatId}, '{}', ${id}, ${source})`;
            });
        await insert('inb_issueassign00001', 'issue_assignment', null);
        await expect(insert('inb_taskassign000001', 'task_assignment', null)).rejects.toThrow(
            /agent_inbox_chat/u
        );
        await expect(insert('inb_issueevent000001', 'issue_event', 'cht_ops')).rejects.toThrow(
            /agent_inbox_chat/u
        );
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedTaskAssignments(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO chats (id, server_id, kind, name) VALUES ('cht_ops', 'srv_one', 'channel', 'ops')`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, state)
            VALUES
                ('inb_queuedassign0001', 'srv_one', 'agt_one', null, '{}',
                    'task-assign:tsk_a:1', 'task_assignment', 'queued'),
                ('inb_seenassign000001', 'srv_one', 'agt_one', 'cht_ops', '{}',
                    'task-assign:tsk_b:1', 'task_assignment', 'seen'),
                ('inb_subagentwake0001', 'srv_one', 'agt_one', null, '',
                    'subagent:agt_one:wake_1', 'subagent', 'queued')`;
        await tx`INSERT INTO agent_run_triggers (server_id, agent_id, run_id, chat_id, source, work_id)
            VALUES
                ('srv_one', 'agt_one', 'run_assigned', null, 'task_assignment', 'task-assign:tsk_a:1'),
                ('srv_one', 'agt_one', 'run_assigned_chat', 'cht_ops', 'task_assignment',
                    'task-assign:tsk_b:1'),
                ('srv_one', 'agt_one', 'run_subagent', null, 'subagent', 'subagent:agt_one:wake_1')`;
    });
}
