import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0138_agents-hear-their-home';

test('0138 homes every Agent where it wrote most, then drops channel memberships and mutes', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-agent-homes-'));
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
        await writeFile(journalPath, through(137));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedAgentsBeforeHomes(database);

        await writeFile(journalPath, through(138));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        const homes = await readHomes(database);
        expect(homes).toEqual([
            { home_project_id: 'cht_web', id: 'agt_arch' },
            { home_project_id: 'cht_haus', id: 'agt_cove' },
            { home_project_id: 'cht_web', id: 'agt_most' },
            { home_project_id: 'cht_haus', id: 'agt_none' },
            { home_project_id: 'cht_api', id: 'agt_task' },
            { home_project_id: 'cht_api', id: 'agt_tie' },
        ]);
        expect(
            await database`
                SELECT to_regclass('public.channel_agent_participants')::text AS participants,
                    to_regclass('public.agent_channel_mutes')::text AS mutes`
        ).toEqual([{ mutes: null, participants: null }]);
        expect(
            await database`
                SELECT chat_id, sequence FROM agent_chat_reads
                WHERE agent_id = 'agt_task' ORDER BY chat_id COLLATE "C"`
        ).toEqual([
            { chat_id: 'cht_api', sequence: 5 },
            { chat_id: 'cht_t_api', sequence: 2 },
        ]);
        expect(
            await database`
                SELECT chat_id, sequence FROM agent_chat_reads
                WHERE agent_id = 'agt_most' ORDER BY chat_id COLLATE "C"`
        ).toEqual([
            { chat_id: 'cht_haus', sequence: 0 },
            { chat_id: 'cht_web', sequence: 16 },
        ]);

        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
        await database`UPDATE agents SET home_project_id = 'cht_haus' WHERE id = 'agt_most'`;
        const replayed = await readFile(join(folder, `${migrationTag}.sql`), 'utf8');
        for (const statement of replayed.split('--> statement-breakpoint')) {
            await database.unsafe(statement);
        }
        expect(await readHomes(database)).toEqual(
            homes.map((row) =>
                row.id === 'agt_most' ? { home_project_id: 'cht_haus', id: 'agt_most' } : row
            )
        );
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function readHomes(database: SQL) {
    return (await database`
        SELECT id, home_project_id FROM agents ORDER BY id COLLATE "C"`) as {
        home_project_id: string;
        id: string;
    }[];
}

async function seedAgentsBeforeHomes(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_a', 'a', 'A')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_ada', 'subject-ada')`;
        await tx`INSERT INTO task_keys (id, server_id, key) VALUES
            ('tky_gen', 'srv_a', 'GEN'), ('tky_web', 'srv_a', 'WEB'), ('tky_api', 'srv_a', 'API'),
            ('tky_old', 'srv_a', 'OLD'), ('tky_gone', 'srv_a', 'GONE')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all, archived_at,
                archived_by_user_id, deleted_at, deleted_by_user_id)
            VALUES
                ('cht_haus', 'srv_a', 'channel', 'haus', true, null, null, null, null),
                ('cht_web', 'srv_a', 'channel', 'web', false, null, null, null, null),
                ('cht_api', 'srv_a', 'channel', 'api', false, null, null, null, null),
                ('cht_old', 'srv_a', 'channel', 'old', false, now(), 'usr_ada', null, null),
                ('cht_gone', 'srv_a', 'channel', 'gone', false, null, null, now(), 'usr_ada')`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id) VALUES
            ('cht_haus', 'srv_a', 'tky_gen'), ('cht_web', 'srv_a', 'tky_web'),
            ('cht_api', 'srv_a', 'tky_api'), ('cht_old', 'srv_a', 'tky_old'),
            ('cht_gone', 'srv_a', 'tky_gone')`;
        await tx`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
            VALUES ('cht_t_api', 'srv_a', 'task', 'cht_api', 'channel')`;
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone,
                home_project_id, factory_kind)
            VALUES
                ('agt_most', 'srv_a', 'Most', 'most', 'UTC', 'cht_haus', 'ordinary'),
                ('agt_task', 'srv_a', 'Task', 'task', 'UTC', 'cht_haus', 'ordinary'),
                ('agt_tie', 'srv_a', 'Tie', 'tie', 'UTC', 'cht_haus', 'ordinary'),
                ('agt_arch', 'srv_a', 'Arch', 'arch', 'UTC', 'cht_haus', 'ordinary'),
                ('agt_none', 'srv_a', 'None', 'none', 'UTC', 'cht_haus', 'ordinary'),
                ('agt_cove', 'srv_a', 'Cove', 'cove', 'UTC', 'cht_haus', 'cove')`;
        await tx`INSERT INTO channel_agent_participants (server_id, chat_id, agent_id) VALUES
            ('srv_a', 'cht_haus', 'agt_most'), ('srv_a', 'cht_web', 'agt_most'),
            ('srv_a', 'cht_api', 'agt_task')`;
        await tx`INSERT INTO agent_channel_mutes (server_id, chat_id, agent_id)
            VALUES ('srv_a', 'cht_web', 'agt_tie')`;
        await tx`INSERT INTO agent_chat_reads (server_id, agent_id, chat_id, sequence)
            VALUES ('srv_a', 'agt_most', 'cht_haus', 0)`;
        const authored = [
            ...messages('agt_most', 'cht_web', [1, 1, 1]),
            ...messages('agt_most', 'cht_api', [1, 1]),
            ...messages('agt_task', 'cht_web', [1, 1]),
            ...messages('agt_task', 'cht_api', [1]),
            ...messages('agt_task', 'cht_t_api', [1, 1]),
            ...messages('agt_tie', 'cht_web', [5, 5]),
            ...messages('agt_tie', 'cht_api', [2, 2]),
            ...messages('agt_arch', 'cht_old', [1, 1, 1, 1, 1]),
            ...messages('agt_arch', 'cht_gone', [1, 1, 1]),
            ...messages('agt_arch', 'cht_web', [1]),
            ...messages('agt_none', 'cht_web', [40, 40, 40]),
            ...messages('agt_cove', 'cht_web', [1, 1, 1, 1, 1]),
        ];
        const sequences = new Map<string, number>();
        for (const message of authored) {
            const sequence = (sequences.get(message.chatId) ?? 0) + 1;
            sequences.set(message.chatId, sequence);
            await tx`INSERT INTO chat_messages
                    (id, server_id, chat_id, author_agent_id, content, nonce, sequence, created_at)
                VALUES (${`msg_${message.chatId}_${sequence}`}, 'srv_a', ${message.chatId},
                    ${message.agentId}, 'work', ${`n-${message.chatId}-${sequence}`}, ${sequence},
                    now() - make_interval(days => ${message.daysAgo}))`;
        }
        for (const [chatId, sequence] of sequences) {
            await tx`UPDATE chats SET last_message_sequence = ${sequence} WHERE id = ${chatId}`;
        }
    });
}

function messages(agentId: string, chatId: string, daysAgo: number[]) {
    return daysAgo.map((days) => ({ agentId, chatId, daysAgo: days }));
}
