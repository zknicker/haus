import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import {
    postgresServerCommand,
    preparePostgresServerDirectory,
} from '../../../scripts/postgres-server-account.mjs';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import {
    clusterEnvironment,
    reserveLoopbackPort,
    resolvePostgresBinaries,
    run,
    runServer,
    waitForReadyCluster,
} from './postgres-process.ts';

/**
 * A throwaway PostgreSQL database that Server tests exercise instead of a mock.
 * Inside the suite runner every database lives in the run's one shared cluster;
 * a file run alone gets a cluster of its own. Either way no two files share rows.
 *
 * `postgres` runs as a direct child rather than through `pg_ctl start`, which
 * daemonises it: a daemonised cluster outlives a killed test runner or
 * Playwright web server and leaks for the life of the machine.
 */
export interface TestDatabase {
    databaseUrl: string;
    stop(): Promise<void>;
}

export interface PostgresClusterOptions {
    /** Pins a language-aware default collation for tests that exercise collation boundaries. */
    icuLocale?: string;
    /** Raises PostgreSQL's connection ceiling for a cluster many test processes share. */
    maxConnections?: number;
}

const clusterUser = 'haus';
const clusterDatabase = 'haus_test';
const sharedAdminUrlVariable = 'HAUS_TEST_POSTGRES_URL';
const sharedTemplateVariable = 'HAUS_TEST_POSTGRES_TEMPLATE';
const sharedMaxConnections = 2000;

/** A fresh database with every migration applied. */
export async function startMigratedDatabase(): Promise<TestDatabase> {
    const shared = readSharedPostgres();
    if (shared) {
        return createSharedDatabase(shared.adminUrl, shared.template);
    }
    const cluster = await startPostgresCluster();
    try {
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    } catch (error) {
        await cluster.stop();
        throw error;
    }
    return cluster;
}

/** A fresh, empty database, for tests that migrate it themselves. */
export async function startEmptyDatabase(): Promise<TestDatabase> {
    const shared = readSharedPostgres();
    if (shared) {
        return createSharedDatabase(shared.adminUrl, null);
    }
    return startPostgresCluster();
}

/**
 * Starts the suite runner's one cluster and migrates its template database once.
 * The returned environment points every test process at it.
 */
export async function startSharedTestPostgres() {
    const cluster = await startPostgresCluster({ maxConnections: sharedMaxConnections });
    try {
        await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
        const adminUrl = withDatabase(cluster.databaseUrl, 'postgres');
        const admin = new SQL({ max: 1, url: adminUrl });
        try {
            await admin.unsafe(
                `ALTER DATABASE ${clusterDatabase} WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`
            );
        } finally {
            await admin.close();
        }
        return {
            environment: {
                [sharedAdminUrlVariable]: adminUrl,
                [sharedTemplateVariable]: clusterDatabase,
            },
            stop: cluster.stop,
        };
    } catch (error) {
        await cluster.stop();
        throw error;
    }
}

/**
 * A throwaway cluster of this file's own, for tests that change cluster-wide
 * state such as roles or the default collation.
 */
export async function startPostgresCluster(
    options: PostgresClusterOptions = {}
): Promise<TestDatabase> {
    const binaries = resolvePostgresBinaries();
    const root = mkdtempSync(join(tmpdir(), 'haus-postgres-'));
    preparePostgresServerDirectory(root);
    const dataDirectory = join(root, 'data');
    const port = reserveLoopbackPort();

    const localeArgs = options.icuLocale
        ? ['--locale-provider=icu', `--icu-locale=${options.icuLocale}`]
        : [];
    runServer(binaries.initdb, [
        '--auth=trust',
        '--encoding=UTF8',
        '--no-sync',
        ...localeArgs,
        '--username',
        clusterUser,
        '--pgdata',
        dataDirectory,
    ]);

    const postgres = postgresServerCommand(binaries.postgres, [
        '-D',
        dataDirectory,
        '-p',
        String(port),
        '-h',
        '127.0.0.1',
        '-k',
        root,
        '-c',
        'fsync=off',
        '-c',
        'full_page_writes=off',
        ...(options.maxConnections ? ['-c', `max_connections=${options.maxConnections}`] : []),
    ]);
    const server = spawn(
        postgres.command,
        postgres.args,
        // stderr is buffered rather than discarded: a postmaster that dies during
        // startup reports why on stderr, and dropping it leaves only an exit code.
        { env: clusterEnvironment(), stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let startupErrors = '';
    server.stderr?.on('data', (chunk) => {
        startupErrors += String(chunk);
    });

    // SIGINT is PostgreSQL's fast shutdown: it releases the cluster's System V
    // shared-memory segment, which SIGKILL leaks — and macOS allows only 32
    // before no cluster can start at all. Teardown resolves only after the
    // child is reaped and its exact temporary root is removed.
    const stopAtProcessExit = () => {
        server.kill('SIGINT');
        rmSync(root, { force: true, recursive: true });
    };
    let stopPromise: Promise<void> | null = null;
    const stop = () => {
        if (stopPromise) {
            return stopPromise;
        }

        process.off('exit', stopAtProcessExit);
        stopPromise = new Promise((resolve) => {
            const finish = () => {
                rmSync(root, { force: true, recursive: true });
                resolve();
            };

            if (server.exitCode !== null || server.signalCode !== null) {
                finish();
                return;
            }

            server.once('exit', finish);
            server.kill('SIGINT');
        });
        return stopPromise;
    };

    // A test that throws before its teardown would otherwise leave the data
    // directory behind even though the child dies with this process.
    process.once('exit', stopAtProcessExit);

    try {
        await waitForReadyCluster(binaries, port, server, () => startupErrors);
        run(binaries.createdb, [
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '--username',
            clusterUser,
            clusterDatabase,
        ]);
    } catch (error) {
        await stop();
        throw error;
    }

    return {
        databaseUrl: `postgres://${clusterUser}@127.0.0.1:${port}/${clusterDatabase}`,
        stop,
    };
}

function readSharedPostgres() {
    const adminUrl = process.env[sharedAdminUrlVariable];
    const template = process.env[sharedTemplateVariable];
    if (!(adminUrl && template)) {
        return null;
    }
    return { adminUrl, template };
}

async function createSharedDatabase(
    adminUrl: string,
    template: string | null
): Promise<TestDatabase> {
    const name = `haus_test_${crypto.randomUUID().replaceAll('-', '')}`;
    const admin = new SQL({ max: 1, url: adminUrl });
    try {
        await admin.unsafe(`CREATE DATABASE ${name}${template ? ` TEMPLATE ${template}` : ''}`);
    } finally {
        await admin.close();
    }

    let stopPromise: Promise<void> | null = null;
    return {
        databaseUrl: withDatabase(adminUrl, name),
        stop: () => {
            stopPromise ??= dropSharedDatabase(adminUrl, name);
            return stopPromise;
        },
    };
}

async function dropSharedDatabase(adminUrl: string, name: string) {
    const admin = new SQL({ max: 1, url: adminUrl });
    try {
        await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    } finally {
        await admin.close();
    }
}

function withDatabase(databaseUrl: string, name: string) {
    const url = new URL(databaseUrl);
    url.pathname = `/${name}`;
    return url.toString();
}
