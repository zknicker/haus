import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

/**
 * ADR 0051 decision 2 over rows 0115 left: an Agent's claim keeps its lock
 * fields, its priority and labels go, and the label catalog stays for Tasks.
 */
test('0116 drops claim priority and labels and keeps the label catalog', async () => {
    const scene = await migrationScene('haus-claim-fields-');
    try {
        await scene.migrateThrough(115);
        await scene.database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO task_labels (server_id, id, name, color)
                VALUES ('srv_one', 'lbl_one', 'Security', 'red')`;
            await tx`INSERT INTO message_claims
                (server_id, chat_id, message_id, number, origin, status, priority,
                 assignee_agent_id, claimed_at, created_by_agent_id)
                VALUES ('srv_one', 'cht_one', 'msg_claim', 3, 'claimed', 'in_progress', 'high',
                    'agt_one', now(), 'agt_one')`;
            await tx`INSERT INTO message_claim_labels (server_id, message_id, label_id)
                VALUES ('srv_one', 'msg_claim', 'lbl_one')`;
        });

        expect(await scene.migrateThrough(116)).toEqual(['0116_drop-claim-priority-labels']);

        expect(
            await scene.database`SELECT message_id, number, origin, status FROM message_claims`
        ).toEqual([
            { message_id: 'msg_claim', number: 3, origin: 'claimed', status: 'in_progress' },
        ]);
        expect(await scene.database`SELECT id, name FROM task_labels`).toEqual([
            { id: 'lbl_one', name: 'Security' },
        ]);
        expect(
            await scene.database`SELECT column_name FROM information_schema.columns
                WHERE table_name = 'message_claims' AND column_name = 'priority'`
        ).toEqual([]);
        expect(
            await scene.database`SELECT table_name FROM information_schema.tables
                WHERE table_name = 'message_claim_labels'`
        ).toEqual([]);
        expect(
            await scene.database`SELECT conname FROM pg_constraint
                WHERE conname = 'message_claims_priority'`
        ).toEqual([]);
        expect(await scene.migrateThrough(116)).toEqual([]);
    } finally {
        await scene.close();
    }
}, 60_000);

/** A real upgrade applies both at once: 0115 deletes the rows 0116's tables held. */
test('0116 runs in the same batch as the 0115 claim move', async () => {
    const scene = await migrationScene('haus-claim-fields-batch-');
    try {
        await scene.migrateThrough(114);
        await scene.database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
            await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_one', 'subject-one')`;
            await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
                VALUES ('mem_one', 'srv_one', 'usr_one', 'owner')`;
            await tx`INSERT INTO task_labels (server_id, id, name, color)
                VALUES ('srv_one', 'lbl_one', 'Security', 'red')`;
            await tx`INSERT INTO chat_messages
                (id, server_id, chat_id, author_user_id, content, nonce, sequence)
                VALUES ('msg_composed', 'srv_one', 'cht_one', 'usr_one', 'Ship the audit', 'n1', 1)`;
            await tx`INSERT INTO message_claims
                (server_id, chat_id, message_id, number, origin, status, priority,
                 created_by_user_id)
                VALUES ('srv_one', 'cht_one', 'msg_composed', 1, 'composed', 'todo', 'high',
                    'usr_one')`;
            await tx`INSERT INTO message_claim_labels (server_id, message_id, label_id)
                VALUES ('srv_one', 'msg_composed', 'lbl_one')`;
        });

        expect(await scene.migrateThrough(116)).toEqual([
            '0115_task-boards',
            '0116_drop-claim-priority-labels',
        ]);

        expect(
            await scene.database`SELECT t.priority, a.label_id
                FROM tasks t JOIN task_label_assignments a ON a.task_id = t.id`
        ).toEqual([{ label_id: 'lbl_one', priority: 'high' }]);
    } finally {
        await scene.close();
    }
}, 60_000);

async function migrationScene(prefix: string) {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), prefix));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
    const journalPath = join(folder, 'meta/_journal.json');
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    return {
        close: async () => {
            await database.close();
            await cluster.stop();
            await rm(folder, { recursive: true, force: true });
        },
        database,
        migrateThrough: async (idx: number) => {
            const entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= idx);
            await writeFile(journalPath, JSON.stringify({ ...journal, entries }));
            return await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        },
    };
}
