import { afterAll, beforeAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

const legacySubject = 'user_legacy_haus_owner';
const cloudflareSubject = 'cloudflare-test-owner';
const verifiedEmail = 'owner@haus.test';
const migrationTime = 1_793_420_400_000;

let cluster: PostgresCluster;

beforeAll(async () => {
    cluster = await startPostgresCluster();
});

afterAll(async () => {
    await cluster.stop();
});

test('auth migration rolls back on unresolved owners and supports forward-recovery-forward', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-auth-migration-'));
    const clusterDatabase = new SQL(cluster.databaseUrl);
    const databaseUrl = new URL(cluster.databaseUrl);
    databaseUrl.pathname = '/haus_auth_migration_test';
    let database: SQL | undefined;
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 101);
        await writeFile(journalPath, JSON.stringify(journal));
        await clusterDatabase.unsafe('CREATE DATABASE haus_auth_migration_test');
        await migrateHausDatabase(databaseUrl.toString(), 'haus', 'haus', folder);
        database = new SQL(databaseUrl.toString());
        await seedLegacyIdentity(database);
        const receiptPath = join(folder, 'identity-import.json');
        await writeFile(
            receiptPath,
            JSON.stringify({
                legacySubject,
                subject: cloudflareSubject,
                userId: 'usr_aaaaaaaaaaaaaaaa',
                verifiedEmails: [verifiedEmail],
            })
        );
        runIdentityImport('--check', receiptPath, databaseUrl.toString());
        runIdentityImport('--stage', receiptPath, databaseUrl.toString());
        runIdentityImport('--stage', receiptPath, databaseUrl.toString());

        await expect(migrateHausDatabase(databaseUrl.toString(), 'haus', 'haus')).rejects.toThrow(
            /unresolved legacy Clerk identity/u
        );
        expect(
            await database`SELECT clerk_user_id FROM users WHERE id = 'usr_aaaaaaaaaaaaaaaa'`
        ).toEqual([{ clerk_user_id: legacySubject }]);
        expect(
            await database`SELECT to_regclass('public.haus_auth_rollback_recovery') AS name`
        ).toEqual([{ name: null }]);

        await database`UPDATE computer_login_grants
            SET approved_by_clerk_user_id = ${legacySubject}`;
        const computerCredentials = await database`
            SELECT id, access_token_hash, refresh_token_hash FROM computer_login_sessions
        `;
        expect(await migrateHausDatabase(databaseUrl.toString(), 'haus', 'haus')).toEqual([
            '0102_cloudflare-human-auth',
        ]);
        await expectCanonicalAuthSchema(database);
        expect(
            await database`SELECT id, access_token_hash, refresh_token_hash
            FROM computer_login_sessions`
        ).toEqual(computerCredentials);

        expect(
            await database`SELECT created_at::text AS created_at
                FROM drizzle.__drizzle_migrations WHERE created_at = ${migrationTime}`
        ).toEqual([{ created_at: String(migrationTime) }]);
        await database`INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
            VALUES ('later-migration-marker', ${migrationTime + 1})`;
        expect(() => runRecoveryScript(databaseUrl.toString())).toThrow(/Later Haus migrations/u);
        expect(
            await database`SELECT auth_subject FROM users WHERE id = 'usr_aaaaaaaaaaaaaaaa'`
        ).toEqual([{ auth_subject: cloudflareSubject }]);
        await database`DELETE FROM drizzle.__drizzle_migrations
            WHERE created_at = ${migrationTime + 1}`;
        runRecoveryScript(databaseUrl.toString());
        expect(await database`SELECT id, clerk_user_id FROM users`).toEqual([
            { id: 'usr_aaaaaaaaaaaaaaaa', clerk_user_id: legacySubject },
        ]);
        expect(
            await database`SELECT id, clerk_user_id, access_token_hash, refresh_token_hash
            FROM computer_login_sessions`
        ).toEqual([
            {
                id: 'cls_aaaaaaaaaaaaaaaa',
                clerk_user_id: legacySubject,
                access_token_hash: 'c'.repeat(64),
                refresh_token_hash: 'd'.repeat(64),
            },
        ]);
        expect(
            await database`SELECT id, approved_by_clerk_user_id FROM computer_login_grants`
        ).toEqual([{ id: 'dgr_aaaaaaaaaaaaaaaa', approved_by_clerk_user_id: legacySubject }]);
        expect(
            await database`SELECT created_at FROM drizzle.__drizzle_migrations
            WHERE created_at = ${migrationTime}`
        ).toEqual([]);

        runIdentityImport('--check', receiptPath, databaseUrl.toString());
        runIdentityImport('--stage', receiptPath, databaseUrl.toString());
        expect(await migrateHausDatabase(databaseUrl.toString(), 'haus', 'haus')).toEqual([
            '0102_cloudflare-human-auth',
        ]);
        await expectCanonicalAuthSchema(database);
        expect(
            await database`SELECT id, access_token_hash, refresh_token_hash
            FROM computer_login_sessions`
        ).toEqual(computerCredentials);
    } finally {
        await database?.close();
        await clusterDatabase.unsafe('DROP DATABASE IF EXISTS haus_auth_migration_test');
        await clusterDatabase.close();
        await rm(folder, { force: true, recursive: true });
    }
}, 20_000);

async function seedLegacyIdentity(database: SQL) {
    await database`INSERT INTO users (id, clerk_user_id, display_name)
        VALUES ('usr_aaaaaaaaaaaaaaaa', ${legacySubject}, 'Zach')`;
    await database`INSERT INTO computer_login_grants (
        id, approved_by_clerk_user_id, device_code_hash, expires_at, origin,
        polling_interval_ms, status, user_code_hash
    ) VALUES (
        'dgr_aaaaaaaaaaaaaaaa', 'user_unresolved', ${'a'.repeat(64)},
        now() + interval '10 minutes', 'https://computer.haus.test', 1000,
        'approved', ${'b'.repeat(64)}
    )`;
    await database`INSERT INTO computer_login_sessions (
        access_token_expires_at, access_token_hash, clerk_user_id, created_at,
        grant_id, id, origin, refresh_token_expires_at, refresh_token_hash
    ) VALUES (
        now() + interval '10 minutes', ${'c'.repeat(64)}, ${legacySubject}, now(),
        'dgr_aaaaaaaaaaaaaaaa', 'cls_aaaaaaaaaaaaaaaa', 'https://computer.haus.test',
        now() + interval '1 day', ${'d'.repeat(64)}
    )`;
}

async function expectCanonicalAuthSchema(database: SQL) {
    expect(await database`SELECT id, auth_subject FROM users`).toEqual([
        { id: 'usr_aaaaaaaaaaaaaaaa', auth_subject: cloudflareSubject },
    ]);
    expect(await database`SELECT id, approved_by_user_id FROM computer_login_grants`).toEqual([
        { id: 'dgr_aaaaaaaaaaaaaaaa', approved_by_user_id: 'usr_aaaaaaaaaaaaaaaa' },
    ]);
    expect(await database`SELECT user_id, email FROM user_verified_emails`).toEqual([
        { user_id: 'usr_aaaaaaaaaaaaaaaa', email: verifiedEmail },
    ]);
}

function runIdentityImport(mode: '--check' | '--stage', receiptPath: string, databaseUrl: string) {
    const result = spawnSync(
        process.execPath,
        [join(import.meta.dir, '../scripts/stage-cloudflare-identity.mjs'), mode, receiptPath],
        {
            encoding: 'utf8',
            env: { ...process.env, HAUS_DATABASE_MIGRATION_URL: databaseUrl },
        }
    );
    if (result.status !== 0) {
        throw new Error(`Identity import ${mode} failed: ${result.stderr || result.error}`);
    }
}

function runRecoveryScript(databaseUrl: string) {
    const result = spawnSync(
        'psql',
        [
            databaseUrl,
            '-v',
            'ON_ERROR_STOP=1',
            '-f',
            join(import.meta.dir, '../recovery/0102_restore_legacy_auth.sql'),
        ],
        { encoding: 'utf8' }
    );
    if (result.status !== 0) {
        throw new Error(`Legacy auth recovery failed: ${result.stderr || result.error}`);
    }
}
