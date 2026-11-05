import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { decodeTaskAssignment } from '../src/tasks/task-assignment-envelope.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

/**
 * ADR 0051 decision 9 over rows 0113 wrote: every Server gains the General
 * board, human-composed and converted claims become GEN Tasks (status to
 * column, labels, assignee, creator, timestamps, and a Mentioned in link to
 * the message), and Agent claims stay claims.
 */
test('0114 gives every Server a General board and moves backlog claims onto it', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-task-boards-'));
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
        await writeFile(journalPath, through(113));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);

        // The rows the new foreign keys reach are real; Chat wiring is skipped.
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO servers (id, slug, display_name) VALUES
                ('srv_one', 'one', 'One'), ('srv_two', 'two', 'Two')`;
            await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_one', 'subject-one')`;
            await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
                VALUES ('mem_one', 'srv_one', 'usr_one', 'owner')`;
            await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
                VALUES ('agt_one', 'srv_one', 'agent-one', 'Agent One', 'UTC')`;
            await tx`INSERT INTO task_labels (server_id, id, name, color)
                VALUES ('srv_one', 'lbl_one', 'Security', 'red')`;
            await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, content, nonce, sequence)
                VALUES
                    ('msg_composed', 'srv_one', 'cht_one', 'usr_one',
                     E'\n  Rotate the keys  \nThey leaked.', 'n1', 1),
                    ('msg_converted', 'srv_one', 'cht_one', 'usr_one', 'Old idea', 'n2', 2),
                    ('msg_claimed', 'srv_one', 'cht_one', 'usr_one', 'Agent work', 'n3', 3)`;
            await tx`INSERT INTO message_claims
                (server_id, chat_id, message_id, number, origin, status, priority,
                 assignee_agent_id, created_by_user_id, created_by_agent_id, claimed_at,
                 created_at, updated_at)
                VALUES
                    ('srv_one', 'cht_one', 'msg_composed', 1, 'composed', 'in_review', 'high',
                     'agt_one', 'usr_one', null, null,
                     '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'),
                    ('srv_one', 'cht_one', 'msg_converted', 2, 'converted', 'closed', 'none',
                     null, null, 'agt_one', null,
                     '2026-01-03T00:00:00Z', '2026-01-04T00:00:00Z'),
                    ('srv_one', 'cht_one', 'msg_claimed', 3, 'claimed', 'in_progress', 'none',
                     'agt_one', null, 'agt_one', now(),
                     '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z')`;
            await tx`INSERT INTO message_claim_labels (server_id, message_id, label_id) VALUES
                ('srv_one', 'msg_composed', 'lbl_one'), ('srv_one', 'msg_claimed', 'lbl_one')`;
            await tx`INSERT INTO agent_inbox
                (id, server_id, agent_id, chat_id, content, dedupe_key, source, state, run_id,
                 created_at)
                VALUES
                    ('inb_staleitem0000000', 'srv_one', 'agt_one', 'cht_one',
                     '[Haus claim assignment claim=#1 target=#ops assignedBy=@ada] Rotate the keys',
                     'claim-assign:msg_composed:3', 'claim_assignment', 'queued', null,
                     '2026-01-02T00:00:00Z'),
                    ('inb_olderitem0000000', 'srv_one', 'agt_one', 'cht_one',
                     '[Haus claim assignment claim=#1 target=#ops assignedBy=@bo] Rotate the keys',
                     'claim-assign:msg_composed:1', 'claim_assignment', 'queued', null,
                     '2026-01-01T00:00:00Z'),
                    ('inb_runningitem00000', 'srv_one', 'agt_one', 'cht_one', 'Rotate the keys',
                     'claim-assign:msg_composed:2', 'claim_assignment', 'accepted', 'run_one',
                     '2026-01-01T12:00:00Z'),
                    ('inb_closeditem000000', 'srv_one', 'agt_one', 'cht_one', 'Old idea',
                     'claim-assign:msg_converted:1', 'claim_assignment', 'queued', null,
                     '2026-01-03T00:00:00Z'),
                    ('inb_keptitem00000000', 'srv_one', 'agt_one', 'cht_one', 'Agent work',
                     'claim-assign:msg_claimed:1', 'claim_assignment', 'queued', null,
                     '2026-01-05T00:00:00Z')`;
        });

        await writeFile(journalPath, through(114));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0114_task-boards',
        ]);

        const boards = await database`
            SELECT server_id, key, name, next_number, created_by_user_id, id ~ '^brd_[A-Za-z0-9_-]{16}$' AS opaque
            FROM boards ORDER BY server_id`;
        expect(boards).toEqual([
            {
                created_by_user_id: null,
                key: 'GEN',
                name: 'General',
                next_number: 3,
                opaque: true,
                server_id: 'srv_one',
            },
            {
                created_by_user_id: null,
                key: 'GEN',
                name: 'General',
                next_number: 1,
                opaque: true,
                server_id: 'srv_two',
            },
        ]);
        expect(
            await database`SELECT name, category, position FROM board_columns
                WHERE server_id = 'srv_two' ORDER BY position`
        ).toEqual([
            { category: 'backlog', name: 'Backlog', position: 0 },
            { category: 'todo', name: 'Todo', position: 1 },
            { category: 'active', name: 'In progress', position: 2 },
            { category: 'done', name: 'Done', position: 3 },
            { category: 'canceled', name: 'Canceled', position: 4 },
        ]);

        const tasks = await database`
            SELECT t.number, t.title, t.description, c.category, t.assignee_agent_id, t.priority,
                t.created_by_user_id, t.created_by_agent_id, (t.created_at AT TIME ZONE 'UTC')::text AS created_at,
                (t.completed_at AT TIME ZONE 'UTC')::text AS completed_at, t.version
            FROM tasks t JOIN board_columns c ON c.id = t.column_id
            ORDER BY t.number`;
        expect(tasks).toEqual([
            {
                assignee_agent_id: 'agt_one',
                category: 'active',
                completed_at: null,
                created_at: '2026-01-01 00:00:00',
                created_by_agent_id: null,
                created_by_user_id: 'usr_one',
                description: '\n  Rotate the keys  \nThey leaked.',
                number: 1,
                priority: 'high',
                title: 'Rotate the keys',
                version: 1,
            },
            {
                assignee_agent_id: null,
                category: 'canceled',
                completed_at: '2026-01-04 00:00:00',
                created_at: '2026-01-03 00:00:00',
                created_by_agent_id: 'agt_one',
                created_by_user_id: null,
                description: 'Old idea',
                number: 2,
                priority: 'none',
                title: 'Old idea',
                version: 1,
            },
        ]);
        expect(
            await database`SELECT t.number, l.label_id FROM task_label_assignments l
                JOIN tasks t ON t.id = l.task_id`
        ).toEqual([{ label_id: 'lbl_one', number: 1 }]);
        expect(
            await database`SELECT l.message_id, l.ordinal, l.text FROM task_message_links l
                JOIN tasks t ON t.id = l.task_id ORDER BY t.number`
        ).toEqual([
            { message_id: 'msg_composed', ordinal: 0, text: 'GEN-1' },
            { message_id: 'msg_converted', ordinal: 0, text: 'GEN-2' },
        ]);
        expect(await database`SELECT message_id, origin FROM message_claims`).toEqual([
            { message_id: 'msg_claimed', origin: 'claimed' },
        ]);
        expect(await database`SELECT message_id FROM message_claim_labels`).toEqual([
            { message_id: 'msg_claimed' },
        ]);
        // A queued assignment for a migrated claim is gone; a held or Agent claim's stays.
        expect(
            await database`SELECT id FROM agent_inbox WHERE source = 'claim_assignment' ORDER BY id`
        ).toEqual([{ id: 'inb_keptitem00000000' }, { id: 'inb_runningitem00000' }]);
        // The open Task keeps one pending wake, from the newest assignment, in the shape
        // delivery reads. The closed claim's Task gets none.
        const [task] = await database`SELECT id FROM tasks WHERE number = 1`;
        const wakes = await database`
            SELECT agent_id, chat_id, content, dedupe_key, id ~ '^inb_[A-Za-z0-9_-]{16}$' AS opaque,
                mentioned, run_id, state, (created_at AT TIME ZONE 'UTC')::text AS created_at
            FROM agent_inbox WHERE source = 'task_assignment'`;
        expect(wakes).toHaveLength(1);
        const { content, ...wake } = wakes[0];
        expect(wake).toEqual({
            agent_id: 'agt_one',
            chat_id: null,
            created_at: '2026-01-02 00:00:00',
            dedupe_key: `task-assign:${task.id}:1`,
            mentioned: true,
            opaque: true,
            run_id: null,
            state: 'queued',
        });
        expect(decodeTaskAssignment(content)).toEqual({
            assignedBy: 'ada',
            assignedByAgent: false,
            board: 'General',
            column: 'In progress',
            id: `task-assign:${task.id}:1`,
            key: 'GEN-1',
            priority: 'high',
            taskId: task.id,
            title: 'Rotate the keys',
        });
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
}, 60_000);
