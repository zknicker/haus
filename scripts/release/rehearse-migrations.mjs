#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
    migrationRehearsalScript,
    pendingMigrationTags,
    rehearsalPsqlArgs,
} from './migration-rehearsal-script.mjs';
import { readFlagValue, runGit } from './release-utils.mjs';

const migrationsPath = 'apps/server/drizzle/postgres';
const productionContainer = 'haus-postgres';
const rehearsalDatabase = 'haus_rehearsal';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
        'Usage: bun run release:rehearse-migrations [--ref <git-ref>] [--host <user@host>] [--identity <ssh-key>]'
    );
    process.exit(0);
}
const ref = readFlagValue(argv, '--ref') ?? 'HEAD';
const host = readFlagValue(argv, '--host') ?? 'zknicker@100.117.221.78';
const identity = readFlagValue(argv, '--identity') ?? join(homedir(), '.ssh/macmini_tailscale');

const revision = (await runGit(['rev-parse', '--verify', `${ref}^{commit}`])).stdout.trim();
const journal = JSON.parse(await gitShow(`${migrationsPath}/meta/_journal.json`));
const container = `haus-migration-rehearsal-${Date.now()}`;

let exitCode = 1;
try {
    const image = remote(`docker inspect --format '{{.Config.Image}}' ${productionContainer}`);
    if (!/^[\w./:@-]+$/u.test(image)) {
        throw new Error(`unexpected ${productionContainer} image ${JSON.stringify(image)}`);
    }
    remote(
        `docker run --detach --rm --network none --name ${container} --env POSTGRES_HOST_AUTH_METHOD=trust ${image}`
    );
    remote(
        `for attempt in $(seq 1 60); do docker exec ${container} pg_isready --host 127.0.0.1 --username postgres --quiet && exit 0; sleep 1; done; echo 'rehearsal database never became ready' >&2; exit 1`
    );
    console.log(`Copying ${productionContainer}/haus_production read-only into ${container}…`);
    remote(
        `docker exec ${container} createdb --username postgres ${rehearsalDatabase} && docker exec ${productionContainer} pg_dump --format custom --username haus_backup --dbname haus_production | docker exec -i ${container} pg_restore --username postgres --dbname ${rehearsalDatabase} --no-owner --no-privileges --exit-on-error`
    );
    const latest = Number(
        remote(
            `docker exec ${container} psql --username postgres --dbname ${rehearsalDatabase} --no-align --tuples-only --command 'SELECT coalesce(max(created_at), 0) FROM drizzle.__drizzle_migrations'`
        )
    );
    const tags = pendingMigrationTags(journal, latest);
    if (tags.length === 0) {
        console.log(`No migrations at ${ref} (${revision.slice(0, 9)}) are pending in production.`);
        exitCode = 0;
    } else {
        console.log(
            `Rehearsing ${tags.length} migrations from ${ref} (${revision.slice(0, 9)}) in one transaction: ${tags[0]} … ${tags.at(-1)}`
        );
        const migrations = [];
        for (const tag of tags) {
            migrations.push({ tag, sql: await gitShow(`${migrationsPath}/${tag}.sql`) });
        }
        const result = ssh(
            `docker exec -i ${container} psql --username postgres --dbname ${rehearsalDatabase} ${rehearsalPsqlArgs.join(' ')}`,
            { input: migrationRehearsalScript(migrations), stdio: ['pipe', 'inherit', 'inherit'] }
        );
        exitCode = result.status === 0 ? 0 : 1;
        console.log(
            exitCode === 0
                ? 'Rehearsal passed: every pending migration applied, every deferred constraint held, and the transaction rolled back.'
                : 'Rehearsal failed: PostgreSQL stopped at the error above, after the last "rehearsal: applying" notice.'
        );
    }
} catch (error) {
    console.error(`Rehearsal could not run: ${error instanceof Error ? error.message : error}`);
} finally {
    const removed = ssh(
        `docker rm --force ${container} >/dev/null 2>&1 || ! docker inspect ${container} >/dev/null 2>&1`,
        { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    if (removed.status !== 0) {
        console.error(`Could not remove ${container} on ${host}; remove it by hand.`);
        exitCode = 1;
    }
}
process.exit(exitCode);

function remote(command) {
    const result = ssh(`set -eu -o pipefail; ${command}`, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) {
        throw new Error(result.stderr.trim() || `remote command exited ${result.status}`);
    }
    return result.stdout.trim();
}

function ssh(command, options) {
    return spawnSync(
        'ssh',
        [
            '-i',
            identity,
            '-o',
            'BatchMode=yes',
            '-o',
            'ConnectTimeout=15',
            host,
            `PATH=/opt/homebrew/bin:/usr/local/bin:$PATH; ${command}`,
        ],
        { encoding: 'utf8', maxBuffer: 1024 * 1024 * 16, ...options }
    );
}

async function gitShow(path) {
    return (await runGit(['show', `${revision}:${path}`])).stdout;
}
