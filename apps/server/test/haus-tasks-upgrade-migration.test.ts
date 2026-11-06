import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { decodeTaskAssignment } from '../src/tasks/task-assignment-envelope.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

/**
 * The production upgrade: a Server already at 0112, with rows under the old task
 * names, takes 0113–0116 in one batch. Backlog claims become GEN Tasks, an Agent
 * claim stays a claim, and the attentions main added ride through untouched.
 */
test('0113–0116 upgrade a Server at 0112 in one batch', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-tasks-upgrade-'));
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
        await writeFile(journalPath, through(112));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedRowsAt0112(database);

        await writeFile(journalPath, through(116));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0113_cloud-agent-pull-requests',
            '0114_rename-tasks-to-claims',
            '0115_task-boards',
            '0116_drop-claim-priority-labels',
        ]);

        expect(
            await database`SELECT t.number, t.title, t.priority, c.category, b.next_number
                FROM tasks t
                JOIN board_columns c ON c.id = t.column_id
                JOIN boards b ON b.id = t.board_id
                ORDER BY t.number`
        ).toEqual([
            {
                category: 'active',
                next_number: 3,
                number: 1,
                priority: 'high',
                title: 'Rotate the keys',
            },
            {
                category: 'canceled',
                next_number: 3,
                number: 2,
                priority: 'none',
                title: 'Old idea',
            },
        ]);
        expect(
            await database`SELECT t.number, l.label_id FROM task_label_assignments l
                JOIN tasks t ON t.id = l.task_id`
        ).toEqual([{ label_id: 'lbl_one', number: 1 }]);
        expect(await database`SELECT message_id, number, origin FROM message_claims`).toEqual([
            { message_id: 'msg_claimed', number: 3, origin: 'claimed' },
        ]);
        expect(await database`SELECT last_claim_number FROM chats`).toEqual([
            { last_claim_number: 3 },
        ]);
        expect(
            await database`SELECT table_name FROM information_schema.tables
                WHERE table_name IN ('message_tasks', 'message_task_labels', 'message_claim_labels')`
        ).toEqual([]);

        const inbox = await database`SELECT id, chat_id, source, dedupe_key, content, state
            FROM agent_inbox ORDER BY source, id`;
        expect(inbox.map((row: { source: string }) => row.source)).toEqual([
            'claim_assignment',
            'greeting',
            'heartbeat',
            'task_assignment',
        ]);
        const [claim, greeting, heartbeat, assignment] = inbox;
        expect(claim).toEqual({
            chat_id: 'cht_one',
            content: '[Haus claim assignment claim=#3 target=#ops assignedBy=@ada] Agent work',
            dedupe_key: 'claim-assign:msg_claimed:1',
            id: 'inb_claimeditem00000',
            source: 'claim_assignment',
            state: 'queued',
        });
        expect(greeting.chat_id).toBe('cht_one');
        expect(heartbeat.chat_id).toBeNull();
        const [task] = await database`SELECT id FROM tasks WHERE number = 1`;
        expect(assignment.chat_id).toBeNull();
        expect(assignment.dedupe_key).toBe(`task-assign:${task.id}:1`);
        expect(decodeTaskAssignment(assignment.content)).toMatchObject({
            assignedBy: 'ada',
            key: 'GEN-1',
            taskId: task.id,
        });
        expect(
            await database`SELECT source, work_id FROM agent_run_triggers ORDER BY run_id`
        ).toEqual([{ source: 'claim_assignment', work_id: 'claim-assign:msg_claimed:1' }]);

        // The widened checks admit the chatless Task assignment and nothing that needs a Chat.
        const checks = await database`SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE conname IN ('agent_inbox_chat', 'agent_run_triggers_chat')`;
        expect(checks).toHaveLength(2);
        for (const { definition } of checks) {
            expect(definition).toContain('task_assignment');
            expect(definition).not.toContain('claim_assignment');
            expect(definition).not.toContain('greeting');
        }
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
}, 60_000);

/** Rows the migrations' foreign keys reach are real; the seed itself skips Chat wiring. */
async function seedRowsAt0112(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_one', 'subject-one')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_one', 'srv_one', 'usr_one', 'owner')`;
        await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
            VALUES ('agt_one', 'srv_one', 'agent-one', 'Agent One', 'UTC')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all, last_message_sequence,
                last_task_number)
            VALUES ('cht_one', 'srv_one', 'channel', 'all', true, 3, 3)`;
        await tx`INSERT INTO task_labels (server_id, id, name, color)
            VALUES ('srv_one', 'lbl_one', 'Security', 'red')`;
        await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, content, nonce, sequence)
            VALUES
                ('msg_composed', 'srv_one', 'cht_one', 'usr_one', 'Rotate the keys', 'n1', 1),
                ('msg_converted', 'srv_one', 'cht_one', 'usr_one', 'Old idea', 'n2', 2),
                ('msg_claimed', 'srv_one', 'cht_one', 'usr_one', 'Agent work', 'n3', 3)`;
        await tx`INSERT INTO message_tasks
            (server_id, chat_id, message_id, number, origin, status, priority, assignee_agent_id,
             created_by_user_id, created_by_agent_id, claimed_at, created_at, updated_at)
            VALUES
                ('srv_one', 'cht_one', 'msg_composed', 1, 'composed', 'in_review', 'high',
                 'agt_one', 'usr_one', null, null, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
                ('srv_one', 'cht_one', 'msg_converted', 2, 'converted', 'closed', 'none',
                 null, null, 'agt_one', null, '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z'),
                ('srv_one', 'cht_one', 'msg_claimed', 3, 'claimed', 'in_progress', 'none',
                 'agt_one', null, 'agt_one', now(), '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z')`;
        await tx`INSERT INTO message_task_labels (server_id, message_id, label_id) VALUES
            ('srv_one', 'msg_composed', 'lbl_one'), ('srv_one', 'msg_claimed', 'lbl_one')`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key, source)
            VALUES
                ('inb_composeditem0000', 'srv_one', 'agt_one', 'cht_one',
                 '[Haus task assignment task=#1 target=#ops assignedBy=@ada] Rotate the keys',
                 'task-assign:msg_composed:2', 'task_assignment'),
                ('inb_claimeditem00000', 'srv_one', 'agt_one', 'cht_one',
                 '[Haus task assignment task=#3 target=#ops assignedBy=@ada] Agent work',
                 'task-assign:msg_claimed:1', 'task_assignment'),
                ('inb_greetingitem0000', 'srv_one', 'agt_one', 'cht_one',
                 'Introduce yourself once in #all.', 'greeting:agt_one', 'greeting'),
                ('inb_heartbeatitem000', 'srv_one', 'agt_one', null, 'Heartbeat', 'heartbeat:1',
                 'heartbeat')`;
        await tx`INSERT INTO agent_run_triggers (server_id, agent_id, run_id, chat_id, source, work_id)
            VALUES ('srv_one', 'agt_one', 'run_assignment', 'cht_one', 'task_assignment',
                'task-assign:msg_claimed:1')`;
    });
}
