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
        ]);
        expect(await upgraded`SELECT display_name FROM users WHERE id = 'usr_upgrade'`).toEqual([
            { display_name: 'Before upgrade' },
        ]);
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
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus')).toEqual([]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_effect_upgrade_test');
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
