import { type ChildProcess, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { postgresLocaleEnvironment } from '../../../scripts/dev-postgres.mjs';
import { postgresServerCommand } from '../../../scripts/postgres-server-account.mjs';

const readyTimeoutMs = 20_000;
const readyPollMs = 50;

export interface PostgresBinaries {
    createdb: string;
    initdb: string;
    pgIsReady: string;
    postgres: string;
}

export async function waitForReadyCluster(
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

export function resolvePostgresBinaries(): PostgresBinaries {
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
export function clusterEnvironment(): NodeJS.ProcessEnv {
    return { ...process.env, ...postgresLocaleEnvironment() };
}

export function runServer(binary: string, args: string[]) {
    const { command, args: commandArgs } = postgresServerCommand(binary, args);
    run(command, commandArgs);
}

export function run(command: string, args: string[]) {
    const result = spawnSync(command, args, { encoding: 'utf8', env: clusterEnvironment() });

    if (result.status !== 0) {
        throw new Error(
            `Failed to provision the PostgreSQL test cluster: ${command} exited ${result.status}.\n${result.stderr ?? ''}`
        );
    }
}

export function reserveLoopbackPort(): number {
    const socket = Bun.listen({
        hostname: '127.0.0.1',
        port: 0,
        socket: { data: () => undefined },
    });
    const { port } = socket;

    socket.stop(true);
    return port;
}
