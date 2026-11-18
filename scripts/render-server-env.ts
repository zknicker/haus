#!/usr/bin/env bun
/**
 * Renders the hosted Haus Server's delivered runtime environment.
 *
 * The launchd job runs `operations/run-server`, which shell-sources
 * `config/server.env`. That file is the analogue of Compose baking environment
 * into a container spec: the platform's delivered copy, never the authority.
 * The authority is the committed `.env.schema`, and this program is the only
 * thing that writes the copy — under `varlock run` with VARLOCK_ENV=production,
 * so every value arrives already resolved from 1Password.
 *
 * It writes the Server's typed configuration and native runtime flags.
 * It never prints a value.
 *
 * The contract travels with the repository, not with the artifact: this runs
 * from a checkout of the workflow's own revision, because the release being
 * deployed may predate the contract entirely. `--source-revision` names the
 * released commit so the two can be compared — see `assertContractsAgree`.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    deliverableNames,
    deliveredEnvironmentNames,
    readSchemaItems,
    serverEnvironmentNames,
    serverEnvModulePath,
    serverRuntimeEnvironmentNames,
} from './lib/env-schema.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const defaultTarget = '/Users/zknicker/srv/haus/config/server.env';
const serviceUser = '_haus_server';

export function shellQuote(value: string) {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}

function readReleasedEnvModule(revision: string) {
    try {
        return execFileSync('git', ['show', `${revision}:${serverEnvModulePath}`], {
            cwd: repositoryRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch {
        return null;
    }
}

/**
 * The delivered file is read by the Server from the *released* artifact, while
 * the values come from the contract in *this* checkout. Normally those two
 * revisions agree and this is a no-op. When they do not — a release cut before
 * a rename, or before the contract existed at all — delivering this checkout's
 * names would leave the running Server falling back to its own defaults for
 * every value it cannot find, silently and in production. Fail before
 * activation instead.
 */
export function assertContractsAgree(released: string[], current: string[], revision: string) {
    const releasedSet = new Set(released);
    const currentSet = new Set(current);
    // Native Bun flags are consumed before JavaScript starts and cannot appear
    // in the released application's typed env module. Compare application names.
    const missing = current.filter(
        (name) => !(releasedSet.has(name) || serverRuntimeEnvironmentNames.has(name))
    );
    const extra = released.filter((name) => !currentSet.has(name));

    if (missing.length === 0 && extra.length === 0) {
        return;
    }

    const detail = [
        missing.length > 0 &&
            `this checkout delivers ${missing.join(', ')}, which it does not read`,
        extra.length > 0 && `it reads ${extra.join(', ')}, which this checkout does not deliver`,
    ]
        .filter(Boolean)
        .join('; ');

    throw new Error(
        `The Server released at ${revision.slice(0, 12)} does not share this revision's environment contract: ${detail}. ` +
            'Deploy a release built from a revision whose Server environment matches the contract, ' +
            'or restore config/server.env by hand before activating that release.'
    );
}

function parseArguments(args: string[]) {
    let target = defaultTarget;
    let sourceRevision: string | null = null;

    for (let index = 0; index < args.length; index += 1) {
        const value = args[index + 1];
        if (args[index] === '--target' && value) {
            target = value;
            index += 1;
        } else if (args[index] === '--source-revision' && value) {
            sourceRevision = value;
            index += 1;
        }
    }

    return { sourceRevision, target };
}

/**
 * The delivered file's contents, from the delivered name set and an already
 * resolved environment. Pure, so the guard can be run against a rendered
 * fixture without a production host.
 */
export function renderEnvironmentFile(names: string[], values: NodeJS.ProcessEnv) {
    const lines = [
        '# Delivered runtime copy of the Haus Server environment.',
        '# Rendered from the repository .env.schema by scripts/render-server-env.ts',
        '# during a deploy. Do not edit: the next deploy overwrites it, and the',
        '# schema is the only owner of every value below.',
    ];
    const rendered: string[] = [];

    for (const name of [...names].sort()) {
        const value = values[name];
        // Absent is absent: writing NAME='' would make the Server's zod schema
        // treat the value as present and reject it instead of applying its
        // default.
        if (value === undefined || value === '') {
            continue;
        }
        lines.push(`${name}=${shellQuote(value)}`);
        rendered.push(name);
    }

    return { contents: `${lines.join('\n')}\n`, rendered };
}

function main() {
    if (process.env.VARLOCK_ENV && process.env.VARLOCK_ENV !== 'production') {
        throw new Error('render-server-env must run under VARLOCK_ENV=production.');
    }

    const { sourceRevision, target } = parseArguments(process.argv.slice(2));
    const deliverable = deliverableNames(readSchemaItems(join(repositoryRoot, '.env.schema')));
    const names = [...deliveredEnvironmentNames(repositoryRoot)];

    if (names.every((name) => serverRuntimeEnvironmentNames.has(name))) {
        throw new Error(
            'No names were extracted from the Server typed env module; refusing to render an empty environment.'
        );
    }

    if (sourceRevision) {
        const releasedModule = readReleasedEnvModule(sourceRevision);
        if (releasedModule === null) {
            throw new Error(
                `Could not read ${serverEnvModulePath} at ${sourceRevision.slice(0, 12)}. ` +
                    'The deploy checkout needs full history (fetch-depth: 0) to compare the released contract.'
            );
        }
        assertContractsAgree(serverEnvironmentNames(releasedModule), names, sourceRevision);
    }

    const unknown = names.filter((name) => !deliverable.has(name));
    if (unknown.length > 0) {
        throw new Error(
            `The Server validates ${unknown.join(', ')}, which .env.schema does not deliver.`
        );
    }

    const { contents, rendered } = renderEnvironmentFile(names, process.env);

    const staging = `${target}.staging`;
    writeFileSync(staging, contents, { mode: 0o600 });
    chmodSync(staging, 0o600);
    // The runner writes as `zknicker`; the launchd job reads as _haus_server.
    // An explicit ACL grants exactly that one read, without widening the file's
    // POSIX mode and without any privileged helper.
    execFileSync('/bin/chmod', ['+a', `${serviceUser} allow read`, staging]);
    renameSync(staging, target);

    console.log(`Rendered ${rendered.length} Server environment names to ${target}:`);
    for (const name of rendered) {
        console.log(`  ${name}`);
    }
}

if (import.meta.main) {
    main();
}
