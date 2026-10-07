import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;

test('upgrades the preceding production schema without replaying migrations', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-upgrade-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_effect_upgrade_test';
    let upgraded: SQL | undefined;
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 28);
        await writeFile(journalPath, JSON.stringify(journal));
        await database.unsafe('CREATE DATABASE haus_effect_upgrade_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL(url.toString());
        await upgraded`INSERT INTO users (id, clerk_user_id, display_name)
            VALUES ('usr_upgrade', 'clerk_upgrade', 'Before upgrade')`;
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus')).toEqual([
            '0029_message_bodies_and_asks',
            '0030_reminder_history_and_cause_snapshot',
            '0031_cloud_agent_work',
            '0032_agent_activity_outcomes',
            '0033_provenance_rollback_writes',
            '0034_proposal_notes_are_messages',
            '0035_background_claims',
            '0036_durable_message_reactions',
            '0037_trigger_history_retention',
            '0038_agents_create_agents',
            '0039_agent_creation_message_detach',
            '0040_ask_options',
            '0041_haus_identity',
            '0042_inline_replies',
            '0043_message-routing',
            '0044_model-reasoning-efforts',
            '0045_addressed_inbox',
            '0046_received_message_activity',
            '0047_expects_reply',
            '0048_sole_addressing',
            '0049_rankwrangler_preset',
            '0050_drop_expects_reply',
            '0051_completes_reply',
            '0052_humans_addressed_by_mention',
            '0053_push_devices',
            '0054_drop_chat_reads_done_sequence',
            '0055_x_preset',
            '0056_github_preset',
            '0057_cloud_agent_model',
            '0058_agent_personality',
            '0059_agent_creation_request',
            '0060_reminder_descriptions',
            '0061_agent_wake_pause',
            '0062_agent_chat_reads',
            '0063_manual_read_receipts',
            '0064_agent_conversation_style',
        ]);
        expect(await upgraded`SELECT display_name FROM users WHERE id = 'usr_upgrade'`).toEqual([
            { display_name: 'Before upgrade' },
        ]);
        expect(
            await upgraded`SELECT data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'chat_reads' AND column_name = 'done_sequence'`
        ).toEqual([{ data_type: 'integer', is_nullable: 'NO', column_default: '0' }]);
        // Server 5.0.0 must still be able to execute its read projection after migration.
        await upgraded`SELECT done_sequence FROM chat_reads`;
        expect(
            await upgraded`SELECT data_type, is_nullable FROM information_schema.columns
            WHERE table_name = 'chat_messages' AND column_name = 'delivery_routing'`
        ).toEqual([{ data_type: 'jsonb', is_nullable: 'YES' }]);
        const columns = await upgraded`SELECT is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'agent_turns' AND column_name = 'activity'`;
        expect(columns).toEqual([
            { is_nullable: 'NO', column_default: '\'{"operations": []}\'::jsonb' },
        ]);
        const constraints = await upgraded`SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE conname IN ('agent_turns_status', 'agent_activity_phase')`;
        expect(constraints).toHaveLength(2);
        for (const constraint of constraints) {
            expect(constraint.definition).toContain('interrupted');
        }
        const [creationMessageFk] = await upgraded`SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE conname = 'agents_creation_message_fk'`;
        expect(creationMessageFk.definition).toContain('ON DELETE SET NULL (creation_message_id)');
        const [createdByAgentFk] = await upgraded`SELECT pg_get_constraintdef(oid) AS definition,
                condeferrable, condeferred
            FROM pg_constraint WHERE conname = 'agents_created_by_agent_fk'`;
        expect(createdByAgentFk).toMatchObject({ condeferrable: true, condeferred: true });
        const [addressedReason] = await upgraded`SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE conname = 'agent_inbox_addressed_reason'`;
        expect(addressedReason.definition).toContain("'routing'");
        expect(
            await upgraded`SELECT column_name FROM information_schema.columns
            WHERE table_name = 'agent_inbox' AND column_name = 'expects_reply'`
        ).toEqual([]);
        expect(
            await upgraded`SELECT table_name, column_name, is_nullable, column_default
            FROM information_schema.columns
            WHERE column_name IN ('cloud_agent_model_params', 'model_params', 'model_dropped_params')
            ORDER BY table_name, column_name`
        ).toEqual([
            {
                table_name: 'cloud_agent_runs',
                column_name: 'model_dropped_params',
                is_nullable: 'NO',
                column_default: "'[]'::jsonb",
            },
            {
                table_name: 'cloud_agent_runs',
                column_name: 'model_params',
                is_nullable: 'NO',
                column_default: "'[]'::jsonb",
            },
            {
                table_name: 'servers',
                column_name: 'cloud_agent_model_params',
                is_nullable: 'NO',
                column_default: "'{}'::jsonb",
            },
        ]);
        expect(
            await upgraded`SELECT conname FROM pg_constraint
            WHERE conname IN ('servers_cloud_agent_model_params_shape', 'cloud_agent_runs_model_params_shape')
            ORDER BY conname`
        ).toEqual([
            { conname: 'cloud_agent_runs_model_params_shape' },
            { conname: 'servers_cloud_agent_model_params_shape' },
        ]);
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus')).toEqual([]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_effect_upgrade_test');
        await database.close();
        await rm(folder, { recursive: true, force: true });
    }
});

test('copies each existing reminder title into its new description', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-reminder-description-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_reminder_description_test';
    let upgraded: SQL | undefined;
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 59);
        await writeFile(journalPath, JSON.stringify(journal));
        await database.unsafe('CREATE DATABASE haus_reminder_description_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL(url.toString());
        const title = 'Check advertising every Monday and look for campaigns that need bid changes';
        // Only the reminder row matters here, so its Server, Agent, and anchor are skipped.
        await upgraded.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO manual_lookup_audit (id,agent_id,intent,operation,reason,runner_id,server_id,topic_id)
                VALUES ('aml_aaaaaaaaaaaaaaaa','agt_upgrade','Choose a standing lane','get','Read guidance before hire','arc_upgrade','srv_upgrade','archetype/patrol'),
                ('aml_bbbbbbbbbbbbbbbb','agt_upgrade','Choose a standing lane','get','Read guidance before hire','arc_upgrade','srv_upgrade','missing/topic')`;
            await tx`INSERT INTO reminders (id, server_id, owner_agent_id, anchor_chat_id,
                    anchor_message_id, created_at, fire_at, status, timezone, title, updated_at)
                VALUES ('rem_upgrade', 'srv_upgrade', 'agt_upgrade', 'cht_upgrade', 'msg_upgrade',
                    now(), now(), 'scheduled', 'UTC', ${title}, now())`;
        });
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus')).toEqual([
            '0060_reminder_descriptions',
            '0061_agent_wake_pause',
            '0062_agent_chat_reads',
            '0063_manual_read_receipts',
            '0064_agent_conversation_style',
        ]);
        expect(
            await upgraded`SELECT topic_id,resolved_topic_id FROM manual_lookup_audit ORDER BY id`
        ).toEqual([
            { topic_id: 'archetype/patrol', resolved_topic_id: null },
            { topic_id: 'missing/topic', resolved_topic_id: null },
        ]);
        expect(await upgraded`SELECT title, description FROM reminders`).toEqual([
            { description: title, title },
        ]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_reminder_description_test');
        await database.close();
        await rm(folder, { recursive: true, force: true });
    }
});

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
});

afterAll(async () => {
    await cluster.stop();
});

test('creates the baseline once and keeps repeated deploys idempotent', async () => {
    await expect(migrateHausDatabase(cluster.databaseUrl, 'not-a-role', 'haus')).rejects.toThrow(
        'plain PostgreSQL identifier'
    );
    await expect(migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus')).resolves.toEqual([]);
    await expect(migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus')).resolves.toEqual([]);

    const database = new SQL(cluster.databaseUrl);
    try {
        const rows = (await database`
            SELECT count(*)::int AS total
            FROM drizzle.__drizzle_migrations
        `) as { total: number }[];
        const servers = (await database`SELECT count(*)::int AS total FROM servers`) as {
            total: number;
        }[];

        expect(rows[0]?.total).toBeGreaterThan(0);
        expect(servers).toEqual([{ total: 0 }]);
    } finally {
        await database.close();
    }
});

test('reports each migration applied to a fresh database exactly once', async () => {
    const database = new SQL(cluster.databaseUrl);
    const databaseName = 'haus_migration_report_test';
    const databaseUrl = new URL(cluster.databaseUrl);
    databaseUrl.pathname = `/${databaseName}`;

    try {
        await database.unsafe(`CREATE DATABASE ${databaseName}`);
        const applied = await migrateHausDatabase(databaseUrl.toString(), 'haus', 'haus');
        const migratedDatabase = new SQL(databaseUrl.toString());
        let migrationRows: { total: number }[];
        try {
            migrationRows = (await migratedDatabase`
                    SELECT count(*)::int AS total
                    FROM drizzle.__drizzle_migrations
                `) as { total: number }[];
        } finally {
            await migratedDatabase.close();
        }

        expect(applied.length).toBeGreaterThan(0);
        expect(new Set(applied).size).toBe(applied.length);
        expect(migrationRows).toEqual([{ total: applied.length }]);
        await expect(migrateHausDatabase(databaseUrl.toString(), 'haus', 'haus')).resolves.toEqual(
            []
        );
    } finally {
        await database.unsafe(`DROP DATABASE IF EXISTS ${databaseName}`);
        await database.close();
    }
});
