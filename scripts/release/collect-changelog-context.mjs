#!/usr/bin/env node

import {
    calculateReleaseImpact,
    formatReleaseImpact,
    releaseImpactTargets,
} from './release-impact.mjs';
import {
    assertReleaseLedger,
    latestProductVersion,
    latestTargetVersion,
} from './release-ledger.mjs';
import { readFlagValue, readJson, runGit } from './release-utils.mjs';

const argv = process.argv.slice(2);
const candidateRef = readFlagValue(argv, '--candidate-ref') ?? 'HEAD';
const maxCommits = readMaxCommits(argv);

if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
}

const ledger = await readJson('releases.json');
assertReleaseLedger(ledger);
const impact = await calculateReleaseImpact({ ledger, candidateRef });

console.log('# Release preparation context');
console.log('');
console.log(`- Candidate: ${candidateRef}`);
console.log(`- Latest Haus version: ${latestProductVersion(ledger)}`);
console.log(`- Latest Server version: ${latestTargetVersion(ledger, 'server') ?? 'unversioned'}`);
console.log(
    `- Latest Haus Agent version: ${latestTargetVersion(ledger, 'agent') ?? 'unversioned'}`
);
console.log('');
console.log(formatReleaseImpact(impact));
console.log('');
console.log('## Relevant commits by target');
console.log('');

for (const target of releaseImpactTargets) {
    const result = impact.targets[target];
    const files = [...result.ownedFiles, ...result.reviewFiles];
    console.log(`### ${target}`);
    console.log('');
    if (files.length === 0) {
        console.log('- No target-owned commits pending.');
        console.log('');
        continue;
    }
    const commits = await readCommits({
        before: result.baseline.sourceRevision,
        after: candidateRef,
        files,
        max: maxCommits,
    });
    if (commits.length === 0) {
        console.log('- No product commits after release-only metadata was removed.');
    }
    for (const commit of commits) {
        console.log(`- ${commit}`);
    }
    console.log('');
}

console.log('## Next decisions');
console.log('');
console.log(
    '- Choose the targets this release ships; any subset may ship, and unshipped changes stay pending.'
);
console.log('- Ship Computer with or before a Server that needs a newer Computer protocol.');
console.log('- Resolve each review target from the diff and record the reason.');
console.log(
    '- Assign SemVer and the next unused iOS build number only after target scope is settled.'
);
console.log('- Then update releases.json, run release:sync-versions, and update CHANGELOG.md.');

async function readCommits({ before, after, files, max }) {
    const { stdout } = await runGit([
        'log',
        '--no-merges',
        '--date=short',
        '--format=%h%x09%ad%x09%s',
        '--max-count',
        `${max}`,
        `${before}..${after}`,
        '--',
        ...files,
    ]);
    return stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !/\t(?:release: v|chore\(release\): prepare v)/u.test(line));
}

function readMaxCommits(args) {
    const value = readFlagValue(args, '--max-commits');
    if (!value) {
        return 200;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1000) {
        throw new Error('--max-commits must be an integer between 1 and 1000');
    }
    return parsed;
}

function printUsage() {
    console.log(
        [
            'Usage: bun run release:collect-changelog-context [--candidate-ref <git-ref>] [--max-commits <N>]',
            '',
            'Run this before assigning versions or editing releases.json.',
        ].join('\n')
    );
}
