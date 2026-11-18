#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { assertReleaseLedger, isDraftRelease, releasePublishesTarget } from './release-ledger.mjs';
import { runGit } from './release-utils.mjs';

const detectorTargetNames = ['computer', 'agent', 'app', 'ios', 'server'];

export async function detectChangedRelease({ before, after, readLedger = readLedgerAtRef }) {
    assertSha(before, 'before');
    assertSha(after, 'after');

    const [beforeLedger, afterLedger] = await Promise.all([readLedger(before), readLedger(after)]);

    if (!afterLedger) {
        throw new Error('after revision does not contain releases.json');
    }

    assertReleaseLedger(afterLedger);
    if (!beforeLedger) {
        return emptyPlan(true);
    }

    assertReleaseLedger(beforeLedger);
    if (afterLedger.length < beforeLedger.length) {
        throw new Error('release ledger history was removed');
    }

    if (afterLedger.length === beforeLedger.length) {
        if (!isDeepStrictEqual(afterLedger, beforeLedger)) {
            throw new Error('release ledger history was edited');
        }
        return emptyPlan(false);
    }

    if (afterLedger.length !== beforeLedger.length + 1) {
        throw new Error('release ledger has multiple appended entries');
    }
    if (!isDeepStrictEqual(afterLedger.slice(0, beforeLedger.length), beforeLedger)) {
        throw new Error('release ledger history was edited');
    }

    const appended = afterLedger.at(-1);
    if (!Object.hasOwn(appended.targets, 'agent')) {
        throw new Error('new release ledger entries must include the Haus Agent target');
    }
    if (isDraftRelease(appended)) {
        return emptyPlan(false);
    }

    return {
        initialLedgerMigration: false,
        targets: Object.fromEntries(
            detectorTargetNames.map((targetName) => [
                targetName,
                releasePublishesTarget(appended, targetName),
            ])
        ),
    };
}

export function emptyPlan(initialLedgerMigration) {
    return {
        initialLedgerMigration,
        targets: {
            computer: false,
            agent: false,
            app: false,
            ios: false,
            server: false,
        },
    };
}

async function readLedgerAtRef(ref) {
    await assertCommit(ref);

    try {
        const { stdout } = await runGit(['show', `${ref}:releases.json`]);
        return JSON.parse(stdout);
    } catch (error) {
        if (isMissingLedgerError(error)) {
            return null;
        }
        throw new Error(`could not read releases.json at ${ref}`, { cause: error });
    }
}

async function assertCommit(ref) {
    try {
        await runGit(['rev-parse', '--verify', `${ref}^{commit}`]);
    } catch (error) {
        throw new Error(`could not resolve ${ref} as a commit`, { cause: error });
    }
}

function isMissingLedgerError(error) {
    return (
        error?.code === 128 && /releases\.json/.test(`${error.stderr ?? ''}${error.stdout ?? ''}`)
    );
}

function assertSha(value, name) {
    if (!/^[0-9a-f]{40}$/u.test(value ?? '')) {
        throw new Error(`--${name} must be a full lowercase Git SHA`);
    }
}

async function runCli() {
    const before = readArg('--before');
    const after = readArg('--after');
    if (!(before && after)) {
        console.error(
            'Usage: node scripts/release/changed-release.mjs --before <sha> --after <sha>'
        );
        process.exitCode = 1;
        return;
    }

    try {
        const plan = await detectChangedRelease({ before, after });
        process.stdout.write(`${JSON.stringify(plan)}\n`);
    } catch (error) {
        console.error(`changed-release error: ${error instanceof Error ? error.message : error}`);
        process.exitCode = 1;
    }
}

function readArg(name) {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
    await runCli();
}
