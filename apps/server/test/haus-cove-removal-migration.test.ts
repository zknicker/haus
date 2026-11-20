import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { writeAgentConversationStyle } from '../src/server-agents/agent-conversation-style.ts';
import { resolveEditableAgent } from '../src/server-agents/update-agent-description.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const computerId = `cmp_${'c'.repeat(16)}`;

test('0137 keeps an existing Cove and its history as ordinary records', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-cove-removal-'));
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
        await writeFile(journalPath, through(136));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedOnboardedServer(database);

        await writeFile(journalPath, through(137));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0137_remove-cove-onboarding',
        ]);

        expect(await database`SELECT id, handle, display_name, description FROM agents`).toEqual([
            {
                description: 'Onboarding Assistant',
                display_name: 'Cove',
                handle: 'cove',
                id: 'agt_cove',
            },
        ]);
        expect(
            await database`SELECT column_name FROM information_schema.columns
                WHERE table_name = 'agents' AND column_name LIKE 'factory_%'`
        ).toEqual([]);
        expect(
            await database`SELECT tablename FROM pg_tables WHERE tablename = 'server_onboarding'`
        ).toEqual([]);
        expect(
            await database`SELECT id, state, undelivered_reason IS NOT NULL AS retired
                FROM agent_inbox ORDER BY id`
        ).toEqual([
            { id: 'inb_onboardqueued001', retired: true, state: 'seen' },
            { id: 'inb_onboardseen00001', retired: false, state: 'seen' },
        ]);
        expect(await database`SELECT run_id, source FROM agent_run_triggers`).toEqual([
            { run_id: 'run_onboarding', source: 'onboarding' },
        ]);
        expect(
            await database`SELECT deleted_at,
                (SELECT count(*)::integer FROM channel_participants WHERE chat_id = 'cht_onboard')
                    AS people,
                (SELECT count(*)::integer FROM channel_agent_participants
                    WHERE chat_id = 'cht_onboard') AS agents
                FROM chats WHERE id = 'cht_onboard'`
        ).toEqual([{ agents: 1, deleted_at: null, people: 1 }]);
        const [computer] = await database`SELECT inventory_invalid_at FROM computers`;
        expect(computer.inventory_invalid_at).toBeInstanceOf(Date);

        const connection = await connectHausDatabase(cluster.databaseUrl);
        try {
            const agent = { agentId: 'agt_cove', serverId: 'srv_cove' };
            expect(await resolveEditableAgent(connection.db, 'srv_cove', '@cove')).toMatchObject({
                id: 'agt_cove',
            });
            expect(
                await writeAgentConversationStyle(connection.db, agent, {
                    conversationStyle: 'Plain and warm.',
                })
            ).toEqual({ conversationStyle: 'Plain and warm.', signatureEmoji: null });
        } finally {
            await connection.close();
        }
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedOnboardedServer(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_cove', 'cove', 'Cove HQ')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_owner', 'subject-owner')`;
        await tx`INSERT INTO server_memberships (id, server_id, user_id, role)
            VALUES ('mem_owner', 'srv_cove', 'usr_owner', 'owner')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, is_all, deleted_at, deleted_by_user_id)
            VALUES ('cht_haus', 'srv_cove', 'channel', 'haus', true, null, null),
                   ('cht_onboard', 'srv_cove', 'channel', 'onboarding-owner', false, now(), 'usr_owner')`;
        await tx`INSERT INTO channel_participants (server_id, chat_id, user_id)
            VALUES ('srv_cove', 'cht_onboard', 'usr_owner')`;
        await tx`INSERT INTO computers (id, server_id, attached_by_user_id, credential_hash)
            VALUES (${computerId}, 'srv_cove', 'usr_owner', ${'a'.repeat(64)})`;
        await tx`INSERT INTO agents (id, server_id, computer_id, handle, display_name, description,
                home_timezone, home_project_id, desired_model_id, desired_runtime_id, factory_kind,
                factory_applied_at)
            VALUES ('agt_cove', 'srv_cove', ${computerId}, 'cove', 'Cove', 'Onboarding Assistant',
                'UTC', 'cht_haus', 'gpt-5.6-sol', 'codex', 'cove', now())`;
        await tx`INSERT INTO channel_agent_participants (server_id, chat_id, agent_id)
            VALUES ('srv_cove', 'cht_onboard', 'agt_cove')`;
        await tx`INSERT INTO server_onboarding (server_id, channel_id, computer_id, agent_id,
                application_id, model_id, runtime_id, phase, failure_code, failure_detail)
            VALUES ('srv_cove', 'cht_onboard', ${computerId}, 'agt_cove', 'cap_cove', 'gpt-5.6-sol',
                'codex', 'complete', 'inventory-invalid', 'Update it and reconnect.')`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, state, seen_at)
            VALUES ('inb_onboardqueued001', 'srv_cove', 'agt_cove', 'cht_onboard', 'Greet the owner.',
                'cap_queued', 'onboarding', 'queued', null),
                   ('inb_onboardseen00001', 'srv_cove', 'agt_cove', 'cht_onboard', 'Greet the owner.',
                'cap_cove', 'onboarding', 'seen', now())`;
        await tx`INSERT INTO agent_run_triggers (server_id, agent_id, run_id, chat_id, source, work_id)
            VALUES ('srv_cove', 'agt_cove', 'run_onboarding', 'cht_onboard', 'onboarding', 'cap_cove')`;
    });
}
