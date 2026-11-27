import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const workerLink = '\n\n[Fix the flake](worker://wkr_aaaaaaaaaaaaaaaa)';

test('0165 settles every Worker-backed row, then drops the Worker and cloud tables', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-delete-workers-'));
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
        await writeFile(journalPath, through(163));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedWorkerRows(database);

        await writeFile(journalPath, through(164));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0165_delete-workers',
        ]);

        expect(
            await database`SELECT dedupe_key, source FROM agent_inbox ORDER BY dedupe_key`
        ).toEqual([
            { dedupe_key: 'drive-conflict:agent', source: 'drive_conflict' },
            { dedupe_key: 'drive-conflict:worker', source: 'drive_conflict' },
            { dedupe_key: 'msg_human', source: 'human' },
            { dedupe_key: 'pull-request:ready', source: 'pull_request' },
        ]);
        const conflicts = await database`SELECT dedupe_key, content FROM agent_inbox
            WHERE source = 'drive_conflict' ORDER BY dedupe_key`;
        expect(conflicts.map((row: { content: string }) => JSON.parse(row.content).writer)).toEqual(
            [
                { agentId: 'agt_one', type: 'agent' },
                { agentId: 'agt_one', type: 'agent' },
            ]
        );
        expect(await database`SELECT id, deleted_by FROM artifacts ORDER BY id`).toEqual([
            { deleted_by: 'user:usr_one', id: 'art_by_user' },
            { deleted_by: 'agent:agt_one', id: 'art_by_worker' },
        ]);
        expect(await database`SELECT id FROM drive_pushes ORDER BY id`).toEqual([
            { id: 'psh_agent' },
        ]);
        expect(await database`SELECT push_id FROM drive_push_outcomes`).toEqual([
            { push_id: 'psh_agent' },
        ]);
        expect(
            await database`SELECT id, body_kind, content FROM chat_messages ORDER BY id`
        ).toEqual([
            { body_kind: 'text', content: 'Done: the flake is fixed.', id: 'msg_follow_up' },
            { body_kind: 'text', content: `Inline ${workerLink} stays.`, id: 'msg_inline' },
            { body_kind: 'text', content: 'The Worker reported.', id: 'msg_report' },
        ]);
        expect(await database`SELECT id, reported_inventory FROM computers`).toEqual([
            { id: 'cmp_aaaaaaaaaaaaaaaa', reported_inventory: { name: 'Mini', runtimes: [] } },
        ]);
        expect(
            await database`SELECT chat_id, default_task_computer_id FROM projects ORDER BY chat_id`
        ).toEqual([
            { chat_id: 'cht_cloud', default_task_computer_id: null },
            { chat_id: 'cht_computer', default_task_computer_id: 'cmp_aaaaaaaaaaaaaaaa' },
        ]);
        expect(await database`SELECT author_agent_id FROM artifact_revisions`).toEqual([
            { author_agent_id: 'agt_one' },
        ]);
        expect(
            await database`SELECT table_name FROM information_schema.tables
                WHERE table_name IN ('workers', 'worker_turns', 'worker_turn_credentials',
                    'worker_place_limits', 'worker_history_links', 'cloud_agent_model_settings')`
        ).toEqual([]);
        const [bodyKind] = await database`SELECT pg_get_constraintdef(oid) AS def
            FROM pg_constraint WHERE conname = 'chat_messages_body_kind'`;
        expect(bodyKind?.def).not.toContain('worker');
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedWorkerRows(database: SQL) {
    const conflict = (type: string) =>
        JSON.stringify({
            files: [{ outcome: 'kept_both', path: 'notes.md' }],
            id: `drive-conflict:${type}`,
            pushId: 'psh_worker',
            writer:
                type === 'worker'
                    ? {
                          agentId: 'agt_one',
                          taskId: 'tsk_one',
                          type,
                          workerId: 'wkr_aaaaaaaaaaaaaaaa',
                      }
                    : { agentId: 'agt_one', type },
        });
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO workers (id, server_id, agent_id, carrier_computer_id, place,
                repository, title, task_id)
            VALUES ('wkr_aaaaaaaaaaaaaaaa', 'srv_one', 'agt_one', 'cmp_aaaaaaaaaaaaaaaa', 'cursor',
                'acme/app', 'Fix the flake', 'tsk_one')`;
        await tx`INSERT INTO worker_turns (id, server_id, worker_id)
            VALUES ('wkt_aaaaaaaaaaaaaaaa', 'srv_one', 'wkr_aaaaaaaaaaaaaaaa')`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, worker_turn_id)
            VALUES
                ('inb_report0000000001', 'srv_one', 'agt_one', 'cht_task', '', 'worker-report:1',
                    'worker_report', 'wkt_aaaaaaaaaaaaaaaa'),
                ('inb_stall00000000001', 'srv_one', 'agt_one', 'cht_task', '', 'worker-stall:1',
                    'worker_stall', 'wkt_aaaaaaaaaaaaaaaa'),
                ('inb_pullrequest00001', 'srv_one', 'agt_one', 'cht_task', 'Ready.',
                    'pull-request:ready', 'pull_request', 'wkt_aaaaaaaaaaaaaaaa'),
                ('inb_conflictworker01', 'srv_one', 'agt_one', null, ${conflict('worker')},
                    'drive-conflict:worker', 'drive_conflict', null),
                ('inb_conflictagent001', 'srv_one', 'agt_one', null, ${conflict('agent')},
                    'drive-conflict:agent', 'drive_conflict', null),
                ('inb_humanmessage0001', 'srv_one', 'agt_one', 'cht_task', 'hi', 'msg_human',
                    'human', null)`;
        await tx`INSERT INTO artifacts (id, server_id, path, path_key, creator_agent_id, deleted_by)
            VALUES
                ('art_by_worker', 'srv_one', 'a.md', 'a.md', 'agt_one',
                    'worker:wkr_aaaaaaaaaaaaaaaa'),
                ('art_by_user', 'srv_one', 'b.md', 'b.md', 'agt_one', 'user:usr_one')`;
        await tx`INSERT INTO artifact_revisions (id, server_id, artifact_id, author_agent_id,
                author_key, author_worker_id, content_type, filename, object_key, request_id,
                reserved_bytes, revision_number, state, title)
            VALUES ('rev_by_worker', 'srv_one', 'art_by_worker', 'agt_one',
                'worker:wkr_aaaaaaaaaaaaaaaa', 'wkr_aaaaaaaaaaaaaaaa', 'text/markdown', 'a.md',
                'objects/a', 'req_1', 0, 1, 'uploading', 'a')`;
        await tx`INSERT INTO drive_pushes (id, server_id, agent_id, task_id, worker_id)
            VALUES
                ('psh_worker', 'srv_one', 'agt_one', 'tsk_one', 'wkr_aaaaaaaaaaaaaaaa'),
                ('psh_agent', 'srv_one', 'agt_one', null, null)`;
        await tx`INSERT INTO drive_push_outcomes (server_id, push_id, author_key, request_id,
                operation, outcome, path_key, base_revision_id)
            VALUES
                ('srv_one', 'psh_worker', 'worker:wkr_aaaaaaaaaaaaaaaa', 'req_w', 'delete', '{}',
                    'a.md', 'rev_by_worker'),
                ('srv_one', 'psh_agent', 'agent:agt_one', 'req_a', 'delete', '{}', 'b.md',
                    'rev_by_worker')`;
        await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_agent_id,
                author_user_id, content, nonce, sequence, body_kind)
            VALUES
                ('msg_report', 'srv_one', 'cht_task', 'agt_one', null,
                    ${`The Worker reported.${workerLink}`}, 'n_report', 1, 'worker-report'),
                ('msg_follow_up', 'srv_one', 'cht_task', null, 'usr_one',
                    'Done: the flake is fixed.', 'n_follow', 2, 'worker-follow-up'),
                ('msg_inline', 'srv_one', 'cht_task', 'agt_one', null,
                    ${`Inline ${workerLink} stays.`}, 'n_inline', 3, 'text')`;
        await tx`INSERT INTO computers (id, server_id, attached_by_user_id, credential_hash,
                reported_inventory, workers_enabled)
            VALUES ('cmp_aaaaaaaaaaaaaaaa', 'srv_one', 'usr_one', ${'a'.repeat(64)},
                ${{ cloudAgentProviders: [], name: 'Mini', runtimes: [], workerRuntimes: [] }},
                true)`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id, default_worker_place,
                default_worker_computer_id)
            VALUES
                ('cht_computer', 'srv_one', 'tky_one', 'computer', 'cmp_aaaaaaaaaaaaaaaa'),
                ('cht_cloud', 'srv_one', 'tky_two', 'cursor', null)`;
    });
}
