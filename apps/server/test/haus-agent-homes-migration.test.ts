import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0146_agents-hear-their-home';

test('0146 keeps each Agent in its Project, marks that Project read, and drops memberships and mutes', async () => {
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
        await writeFile(journalPath, through(145));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedMemberships(database);

        await writeFile(journalPath, through(146));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        expect(await readHomes(database)).toEqual([
            { home_project_id: 'cht_api', id: 'agt_api' },
            { home_project_id: 'cht_web', id: 'agt_web' },
        ]);
        expect(
            await database`
                SELECT to_regclass('public.channel_agent_participants')::text AS participants,
                    to_regclass('public.agent_channel_mutes')::text AS mutes`
        ).toEqual([{ mutes: null, participants: null }]);
        expect(await readReads(database)).toEqual([
            { agent_id: 'agt_api', chat_id: 'cht_api', sequence: 5 },
            { agent_id: 'agt_api', chat_id: 'cht_t_api', sequence: 2 },
            { agent_id: 'agt_web', chat_id: 'cht_web', sequence: 1 },
        ]);

        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
        const replayed = await readFile(join(folder, `${migrationTag}.sql`), 'utf8');
        for (const statement of replayed.split('--> statement-breakpoint')) {
            await database.unsafe(statement);
        }
        expect(await readReads(database)).toEqual([
            { agent_id: 'agt_api', chat_id: 'cht_api', sequence: 5 },
            { agent_id: 'agt_api', chat_id: 'cht_t_api', sequence: 2 },
            { agent_id: 'agt_web', chat_id: 'cht_web', sequence: 1 },
        ]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function readHomes(database: SQL) {
    return await database`SELECT id, home_project_id FROM agents ORDER BY id COLLATE "C"`;
}

async function readReads(database: SQL) {
    return await database`
        SELECT agent_id, chat_id, sequence FROM agent_chat_reads
        ORDER BY agent_id COLLATE "C", chat_id COLLATE "C"`;
}

async function seedMemberships(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_a', 'a', 'A')`;
        await tx`INSERT INTO task_keys (id, server_id, key) VALUES
            ('tky_web', 'srv_a', 'WEB'), ('tky_api', 'srv_a', 'API')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, last_message_sequence) VALUES
            ('cht_web', 'srv_a', 'channel', 'web', 9), ('cht_api', 'srv_a', 'channel', 'api', 5)`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id) VALUES
            ('cht_web', 'srv_a', 'tky_web'), ('cht_api', 'srv_a', 'tky_api')`;
        await tx`INSERT INTO chats
                (id, server_id, kind, parent_chat_id, parent_chat_kind, last_message_sequence)
            VALUES ('cht_t_api', 'srv_a', 'task', 'cht_api', 'channel', 2)`;
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone,
                home_project_id)
            VALUES
                ('agt_web', 'srv_a', 'Web', 'web', 'UTC', 'cht_web'),
                ('agt_api', 'srv_a', 'Api', 'api', 'UTC', 'cht_api')`;
        await tx`INSERT INTO channel_agent_participants (server_id, chat_id, agent_id) VALUES
            ('srv_a', 'cht_web', 'agt_web'), ('srv_a', 'cht_api', 'agt_web')`;
        await tx`INSERT INTO agent_channel_mutes (server_id, chat_id, agent_id)
            VALUES ('srv_a', 'cht_api', 'agt_web')`;
        await tx`INSERT INTO agent_chat_reads (server_id, agent_id, chat_id, sequence)
            VALUES ('srv_a', 'agt_web', 'cht_web', 1)`;
    });
}
