import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { createServer } from '../src/servers/create-server.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0141_all-is-a-chat';

test('0141 makes #all a chat, moves its Project to #general, and rehomes Agents', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-all-is-a-chat-'));
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
        await writeFile(journalPath, through(140));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedServers(database);

        await writeFile(journalPath, through(141));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        const [general] = await database`
            SELECT id FROM chats WHERE server_id = 'srv_a' AND name = 'general-2'`;
        const generalId = general.id as string;
        expect(
            await database`SELECT id, name, is_all, archived_at IS NOT NULL AS archived,
                    deleted_at IS NOT NULL AS deleted
                FROM chats WHERE kind = 'channel' ORDER BY server_id, name`
        ).toEqual([
            channel('cht_a_all', 'all', { isAll: true }),
            channel('cht_a_user_all', 'all-2', { archived: true }),
            channel('cht_a_general', 'general'),
            channel(generalId, 'general-2'),
            channel('cht_a_onboard', 'onboarding-owner'),
            channel('cht_a_product', 'product'),
            channel('cht_b_all', 'all', { isAll: true }),
            channel('cht_b_user_all', 'all-2', { deleted: true }),
        ]);
        expect(
            await database`SELECT chat_id, task_key_id FROM projects ORDER BY server_id, task_key_id`
        ).toEqual([
            { chat_id: generalId, task_key_id: 'tky_a_gen' },
            { chat_id: 'cht_a_onboard', task_key_id: 'tky_a_onb' },
            { chat_id: 'cht_a_product', task_key_id: 'tky_a_prod' },
        ]);
        expect(
            await database`SELECT user_id FROM channel_participants
                WHERE chat_id = ${generalId} ORDER BY user_id`
        ).toEqual([{ user_id: 'usr_a' }, { user_id: 'usr_b' }]);

        expect(
            await database`SELECT task.id, task.number, task.project_id, task.origin_chat_id,
                    place.parent_chat_id
                FROM tasks task JOIN chats place ON place.id = task.chat_id`
        ).toEqual([
            {
                id: 'tsk_a_open',
                number: 1,
                origin_chat_id: 'cht_a_all',
                parent_chat_id: generalId,
                project_id: generalId,
            },
        ]);
        await database`UPDATE tasks SET title = 'Still writable' WHERE id = 'tsk_a_open'`;
        expect(await database`SELECT title FROM tasks WHERE id = 'tsk_a_open'`).toEqual([
            { title: 'Still writable' },
        ]);

        expect(await database`SELECT id, home_project_id FROM agents ORDER BY id`).toEqual([
            { home_project_id: 'cht_a_product', id: 'agt_a_busy' },
            { home_project_id: generalId, id: 'agt_a_onboarded' },
            { home_project_id: 'cht_a_product', id: 'agt_a_product' },
            { home_project_id: generalId, id: 'agt_a_quiet' },
            { home_project_id: null, id: 'agt_a_retired' },
            { home_project_id: generalId, id: 'agt_a_tasker' },
        ]);

        await database`INSERT INTO task_keys (id, server_id, key) VALUES ('tky_b_all', 'srv_b', 'ALL')`;
        await expect(
            settle(database`INSERT INTO projects (chat_id, server_id, task_key_id)
                VALUES ('cht_b_all', 'srv_b', 'tky_b_all')`)
        ).rejects.toThrow(/projects_chat_fk/u);
        await expect(
            settle(database`INSERT INTO projects (chat_id, server_id, task_key_id, chat_is_all)
                VALUES ('cht_b_all', 'srv_b', 'tky_b_all', true)`)
        ).rejects.toThrow(/projects_chat_not_all|projects_chat_fk/u);
        await expect(
            settle(database`UPDATE agents SET home_project_id = NULL WHERE id = 'agt_a_busy'`)
        ).rejects.toThrow(/agents_home_project_shape/u);

        const before = await snapshot(database);
        const migration = await readFile(
            join(import.meta.dir, `../drizzle/postgres/${migrationTag}.sql`),
            'utf8'
        );
        for (const statement of migration.split('--> statement-breakpoint')) {
            await database.unsafe(statement);
        }
        expect(await snapshot(database)).toEqual(before);

        const connection = await connectHausDatabase(cluster.databaseUrl);
        try {
            const created = await createServer(connection.db, {
                displayName: 'Fresh',
                slug: 'fresh',
                userId: 'usr_a',
            });
            expect(
                await database`SELECT
                    (SELECT count(*)::integer FROM projects WHERE server_id = ${created.id}) AS projects,
                    (SELECT count(*)::integer FROM agents WHERE server_id = ${created.id}) AS agents,
                    (SELECT array_agg(name) FROM chats WHERE server_id = ${created.id} AND is_all)
                        AS everyone`
            ).toEqual([{ agents: 0, everyone: ['all'], projects: 0 }]);
        } finally {
            await connection.close();
        }
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

function channel(
    id: string,
    name: string,
    flags: { archived?: boolean; deleted?: boolean; isAll?: boolean } = {}
) {
    return {
        archived: flags.archived ?? false,
        deleted: flags.deleted ?? false,
        id,
        is_all: flags.isAll ?? false,
        name,
    };
}

async function settle(query: PromiseLike<unknown>) {
    return await query;
}

async function snapshot(database: SQL) {
    return {
        agents: await database`SELECT id, home_project_id FROM agents ORDER BY id`,
        chats: await database`SELECT id, name, parent_chat_id FROM chats ORDER BY id`,
        participants:
            await database`SELECT chat_id, user_id FROM channel_participants ORDER BY chat_id, user_id`,
        projects: await database`SELECT chat_id, task_key_id FROM projects ORDER BY chat_id`,
        tasks: await database`SELECT id, project_id FROM tasks ORDER BY id`,
    };
}

async function seedServers(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name)
            VALUES ('srv_a', 'old-hq', 'Old HQ'), ('srv_b', 'bare-hq', 'Bare HQ')`;
        await tx`INSERT INTO users (id, auth_subject)
            VALUES ('usr_a', 'subject-a'), ('usr_b', 'subject-b')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_a', 'srv_a', 'usr_a', 'owner'), ('mem_b', 'srv_a', 'usr_b', 'member'),
                   ('mem_c', 'srv_b', 'usr_a', 'owner')`;
        await tx`INSERT INTO task_keys (id, server_id, key, next_number) VALUES
            ('tky_a_gen', 'srv_a', 'GEN', 2), ('tky_a_prod', 'srv_a', 'PROD', 1),
            ('tky_a_onb', 'srv_a', 'ONBO', 1)`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all, archived_at,
                archived_by_user_id, deleted_at, deleted_by_user_id, last_message_sequence)
            VALUES
                ('cht_a_all', 'srv_a', 'channel', 'haus', true, null, null, null, null, 1),
                ('cht_a_product', 'srv_a', 'channel', 'product', false, null, null, null, null, 1),
                ('cht_a_onboard', 'srv_a', 'channel', 'onboarding-owner', false, null, null, null, null, 1),
                ('cht_a_general', 'srv_a', 'channel', 'general', false, null, null, null, null, 0),
                ('cht_a_user_all', 'srv_a', 'channel', 'all', false, now(), 'usr_a', null, null, 0),
                ('cht_b_all', 'srv_b', 'channel', 'haus', true, null, null, null, null, 0),
                ('cht_b_user_all', 'srv_b', 'channel', 'all', false, null, null, now(), 'usr_a', 0)`;
        await tx`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind,
                last_message_sequence)
            VALUES ('cht_a_task', 'srv_a', 'task', 'cht_a_all', 'channel', 1)`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id, created_at) VALUES
            ('cht_a_all', 'srv_a', 'tky_a_gen', '2026-01-01T00:00:00Z'),
            ('cht_a_product', 'srv_a', 'tky_a_prod', '2026-02-01T00:00:00Z'),
            ('cht_a_onboard', 'srv_a', 'tky_a_onb', '2026-03-01T00:00:00Z')`;
        await tx`INSERT INTO channel_participants (server_id, chat_id, user_id) VALUES
            ('srv_a', 'cht_a_all', 'usr_a'), ('srv_a', 'cht_a_all', 'usr_b'),
            ('srv_b', 'cht_b_all', 'usr_a')`;
        await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone,
                home_project_id, retired_at)
            VALUES
                ('agt_a_busy', 'srv_a', 'busy-one', 'Busy', 'UTC', 'cht_a_all', null),
                ('agt_a_quiet', 'srv_a', 'quiet', 'Quiet', 'UTC', 'cht_a_all', null),
                ('agt_a_onboarded', 'srv_a', 'onboarded', 'Onboarded', 'UTC', 'cht_a_all', null),
                ('agt_a_tasker', 'srv_a', 'tasker', 'Tasker', 'UTC', 'cht_a_all', null),
                ('agt_a_retired', 'srv_a', 'retired', 'Retired', 'UTC', 'cht_a_all', now()),
                ('agt_a_product', 'srv_a', 'product-one', 'Product', 'UTC', 'cht_a_product', null)`;
        await tx`INSERT INTO chat_messages (id, server_id, chat_id, author_user_id, author_agent_id,
                content, nonce, sequence)
            VALUES
                ('msg_a_origin', 'srv_a', 'cht_a_all', 'usr_a', null, 'Start GEN-1', 'n1', 1),
                ('msg_a_busy', 'srv_a', 'cht_a_product', null, 'agt_a_busy', 'shipping', 'n2', 1),
                ('msg_a_onb', 'srv_a', 'cht_a_onboard', null, 'agt_a_onboarded', 'welcome', 'n3', 1),
                ('msg_a_task', 'srv_a', 'cht_a_task', null, 'agt_a_tasker', 'on it', 'n4', 1)`;
        await tx`INSERT INTO tasks (id, server_id, chat_id, key_id, number, origin_chat_id,
                origin_message_id, project_id, state, title, created_by_user_id)
            VALUES ('tsk_a_open', 'srv_a', 'cht_a_task', 'tky_a_gen', 1, 'cht_a_all',
                'msg_a_origin', 'cht_a_all', 'open', 'Open GEN task', 'usr_a')`;
    });
}
