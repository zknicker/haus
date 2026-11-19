import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SQL } from 'bun';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { startPostgresCluster, type TestDatabase } from './postgres-cluster.ts';
import { resolvePostgresBinaries } from './postgres-process.ts';

const serverRoot = fileURLToPath(new URL('../', import.meta.url));
const backupScript = join(serverRoot, 'operations', 'backup-haus');
const verifyScript = join(serverRoot, 'operations', 'verify-haus-backup');
const backupRole = 'haus_backup_test';
const seededNightlies = Array.from(
    { length: 15 },
    (_, day) => `202501${String(day + 10).padStart(2, '0')}T033000Z`
);
const seededWeeklies = ['2025-W01', '2025-W02', '2025-W03', '2025-W04', '2025-W05'];
let cluster: TestDatabase;
let backupRoot: string;
let environment: Record<string, string>;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    const admin = new SQL(cluster.databaseUrl);
    try {
        await admin.unsafe(`CREATE ROLE ${backupRole} LOGIN`);
        await admin.unsafe(`GRANT CONNECT ON DATABASE haus_test TO ${backupRole}`);
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus', backupRole);
    } finally {
        await admin.close();
    }
    backupRoot = mkdtempSync(join(tmpdir(), 'haus-local-backup-'));
    const url = new URL(cluster.databaseUrl);
    environment = {
        HAUS_BACKUP_ADMIN_ROLE: 'haus',
        HAUS_BACKUP_DATABASE: 'haus_test',
        HAUS_BACKUP_POSTGRES_CONTAINER: '',
        HAUS_BACKUP_ROLE: backupRole,
        HAUS_BACKUP_ROOT: backupRoot,
        PATH: `${dirname(resolvePostgresBinaries().initdb)}:/usr/bin:/bin`,
        PGHOST: url.hostname,
        PGPORT: url.port,
    };
});

afterAll(async () => {
    await cluster.stop();
    rmSync(backupRoot, { force: true, recursive: true });
});

test('dumps as the read-only role, promotes a weekly, and prunes to 14 nightlies and 4 weeklies', () => {
    for (const name of seededNightlies) {
        mkdirSync(join(backupRoot, 'nightly', name), { recursive: true });
    }
    for (const name of seededWeeklies) {
        mkdirSync(join(backupRoot, 'weekly', name), { recursive: true });
    }

    const backup = runScript(backupScript, environment);

    expect(backup.stderr).toBe('');
    expect(backup.exitCode).toBe(0);
    expect(backup.stdout).toMatch(
        /haus-backup ok nightly\/\d{8}T\d{6}Z dump_bytes=\d+ runner=not-applicable weekly\/\d{4}-W\d{2}=created kept_nightly=14 kept_weekly=4\n$/u
    );
    const nightly = readdirSync(join(backupRoot, 'nightly')).sort();
    const latest = nightly.at(-1) ?? '';
    expect(nightly).toEqual([...seededNightlies.slice(2), latest]);
    const weekly = readdirSync(join(backupRoot, 'weekly')).sort();
    expect(weekly.slice(0, 3)).toEqual(['2025-W03', '2025-W04', '2025-W05']);
    const latestWeekly = weekly.at(-1) ?? '';
    expect(statSync(join(backupRoot, 'weekly', latestWeekly, 'haus.dump')).ino).toBe(
        statSync(join(backupRoot, 'nightly', latest, 'haus.dump')).ino
    );
});

test('restores the latest dump into a throwaway database and drops it', async () => {
    const admin = new SQL(cluster.databaseUrl);
    try {
        const [live] = (await admin`
            SELECT
                (SELECT count(*) FROM pg_tables WHERE schemaname IN ('public', 'drizzle'))::int AS tables,
                (SELECT count(*) FROM drizzle.__drizzle_migrations)::int AS migrations
        `) as { migrations: number; tables: number }[];

        const verify = runScript(verifyScript, environment);

        expect(verify.stderr).toBe('');
        expect(verify.exitCode).toBe(0);
        expect(verify.stdout).toContain(
            `tables=${live?.tables} migrations=${live?.migrations} runner=absent\n`
        );
        const leftover = await admin`
            SELECT datname FROM pg_database WHERE datname = 'haus_restore_check'
        `;
        expect(leftover).toHaveLength(0);
    } finally {
        await admin.close();
    }
});

test('logs the failing step and leaves no partial backup when the dump fails', () => {
    const before = readdirSync(join(backupRoot, 'nightly'), { withFileTypes: false });

    const backup = runScript(backupScript, { ...environment, HAUS_BACKUP_ROLE: 'haus_missing' });

    expect(backup.exitCode).not.toBe(0);
    expect(backup.stderr).toMatch(/haus-backup failed during pg_dump \(exit \d+\)\n$/u);
    expect(readdirSync(join(backupRoot, 'nightly'), { withFileTypes: false })).toEqual(before);
    expect(readdirSync(backupRoot).sort()).toEqual(['nightly', 'weekly']);
});

test('refuses to run while another backup holds the lock', () => {
    mkdirSync(join(backupRoot, '.lock'));
    try {
        const backup = runScript(backupScript, environment);

        expect(backup.exitCode).toBe(1);
        expect(backup.stderr).toStartWith(
            `${backupRoot}/.lock exists; another backup is running or one died holding it.\n`
        );
        expect(backup.stderr).toEndWith(' haus-backup failed during lock (exit 1)\n');
        expect(existsSync(join(backupRoot, '.lock'))).toBe(true);
    } finally {
        rmSync(join(backupRoot, '.lock'), { recursive: true });
    }
});

test('ships a nightly LaunchDaemon that logs beside the Server', () => {
    const plist = join(serverRoot, 'launchd', 'com.haus.local-backup.plist');
    const converted = Bun.spawnSync(['/usr/bin/plutil', '-convert', 'json', '-o', '-', plist], {
        stderr: 'pipe',
        stdout: 'pipe',
    });

    expect(converted.exitCode).toBe(0);
    expect(JSON.parse(converted.stdout.toString())).toEqual({
        EnvironmentVariables: {
            HOME: '/Users/zknicker',
            PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        },
        Label: 'com.haus.local-backup',
        ProgramArguments: ['/bin/sh', '/Users/zknicker/srv/haus/current/operations/backup-haus'],
        StandardErrorPath: '/Users/zknicker/srv/haus/logs/backup.error.log',
        StandardOutPath: '/Users/zknicker/srv/haus/logs/backup.log',
        StartCalendarInterval: { Hour: 3, Minute: 30 },
        UserName: 'zknicker',
    });
});

function runScript(script: string, env: Record<string, string>) {
    const result = Bun.spawnSync(['/bin/sh', script], { env, stderr: 'pipe', stdout: 'pipe' });
    return {
        exitCode: result.exitCode,
        stderr: result.stderr.toString(),
        stdout: result.stdout.toString(),
    };
}
