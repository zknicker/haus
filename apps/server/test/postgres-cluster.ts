import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postgresLocaleEnvironment } from '../../../scripts/dev-postgres.mjs';
import {
    postgresServerCommand,
    preparePostgresServerDirectory,
} from '../../../scripts/postgres-server-account.mjs';

/**
 * Runs a throwaway PostgreSQL cluster so Server tests exercise real
 * PostgreSQL instead of a mock. Each cluster owns its own data directory and
 * port, so parallel test files never share rows.
 *
 * `postgres` runs as a direct child rather than through `pg_ctl start`, which
 * daemonises it: a daemonised cluster outlives a killed test runner or
 * Playwright web server and leaks for the life of the machine.
 */
export interface PostgresCluster {
    databaseUrl: string;
    stop(): Promise<void>;
}

export interface PostgresClusterOptions {
    /** Pins a language-aware default collation for tests that exercise collation boundaries. */
    icuLocale?: string;
}

const clusterUser = 'haus';
const clusterDatabase = 'haus_test';
const readyTimeoutMs = 20_000;
const readyPollMs = 50;

export async function startPostgresCluster(
    options: PostgresClusterOptions = {}
): Promise<PostgresCluster> {
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

interface PostgresBinaries {
    createdb: string;
    initdb: string;
    pgIsReady: string;
    postgres: string;
}

async function waitForReadyCluster(
    binaries: PostgresBinaries,
    port: number,
    server: ChildProcess,
    readStartupErrors: () => string
) {
    const deadline = Date.now() + readyTimeoutMs;

    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            const reported = readStartupErrors().trim();
            throw new Error(
                `The PostgreSQL test cluster exited with code ${server.exitCode} before accepting connections.${
                    reported ? `\n${reported}` : ''
                }`
            );
        }

        const ready = spawnSync(
            binaries.pgIsReady,
            ['--host', '127.0.0.1', '--port', String(port)],
            { stdio: 'ignore' }
        );

        if (ready.status === 0) {
            return;
        }

        await Bun.sleep(readyPollMs);
    }

    const reported = readStartupErrors().trim();
    throw new Error(
        `The PostgreSQL test cluster did not accept connections in time.${reported ? `\n${reported}` : ''}`
    );
}

function resolvePostgresBinaries(): PostgresBinaries {
    const explicitRoot = process.env.HAUS_POSTGRES_BIN;
    const searchRoots = explicitRoot
        ? [explicitRoot]
        : ['/opt/homebrew/opt/postgresql@16/bin', '/usr/local/opt/postgresql@16/bin', ''];

    for (const searchRoot of searchRoots) {
        const candidate = {
            createdb: join(searchRoot, 'createdb'),
            initdb: join(searchRoot, 'initdb'),
            pgIsReady: join(searchRoot, 'pg_isready'),
            postgres: join(searchRoot, 'postgres'),
        };

        if (spawnSync(candidate.initdb, ['--version'], { stdio: 'ignore' }).status === 0) {
            return candidate;
        }
    }

    throw new Error(
        'PostgreSQL is required for Server tests but its binaries were not found. Install PostgreSQL 16 (`brew install postgresql@16`) or point HAUS_POSTGRES_BIN at its bin directory.'
    );
}

/**
 * PostgreSQL 16 on macOS aborts at startup when it inherits no locale, which is
 * what a non-interactive shell provides — without this the whole lane is
 * unrunnable. The rule lives with the development cluster's; collation-sensitive
 * tests pin their own ordering through `icuLocale`.
 */
function clusterEnvironment(): NodeJS.ProcessEnv {
    return { ...process.env, ...postgresLocaleEnvironment() };
}

function runServer(binary: string, args: string[]) {
    const { command, args: commandArgs } = postgresServerCommand(binary, args);
    run(command, commandArgs);
}

function run(command: string, args: string[]) {
    const result = spawnSync(command, args, { encoding: 'utf8', env: clusterEnvironment() });

    if (result.status !== 0) {
        throw new Error(
            `Failed to provision the PostgreSQL test cluster: ${command} exited ${result.status}.\n${result.stderr ?? ''}`
        );
    }
}

function reserveLoopbackPort(): number {
    const socket = Bun.listen({
        hostname: '127.0.0.1',
        port: 0,
        socket: { data: () => undefined },
    });
    const { port } = socket;

    socket.stop(true);
    return port;
}
