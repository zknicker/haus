import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyComputerOnlyRelease } from './computer-release-verifier.mjs';
import { extractReleaseNotes } from './extract-release-notes-from-changelog.mjs';
import { verifyNormalRelease, verifyProductRelease } from './github-release-verifier.mjs';

export { verifyComputerOnlyRelease, verifyNormalRelease, verifyProductRelease };

export function ensureProductRelease({ repository, sourceRevision, releaseVersion, runGh }) {
    const tagName = `v${releaseVersion}`;
    try {
        runGh(['release', 'view', tagName, '--repo', repository]);
        return false;
    } catch {
        const notes = extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), releaseVersion);
        runGh(
            [
                'release',
                'create',
                tagName,
                '--repo',
                repository,
                '--target',
                sourceRevision,
                '--title',
                tagName,
                '--notes-file',
                '-',
                '--latest',
            ],
            notes
        );
        return true;
    }
}

export function assertSelectedJobResults({ results, targets }) {
    assertRecord(results, 'release job results');
    assertRecord(targets, 'release target outcomes');
    const selectedJobs = [
        ['computer', 'publish_computer'],
        ['app', 'publish_app'],
        ['ios', 'upload_ios'],
        ['server', 'publish_server'],
    ];
    if (targets.server) {
        selectedJobs.push(['server', 'promote_server']);
    }
    for (const [target, job] of selectedJobs) {
        if (targets[target] && results[job]?.result !== 'success') {
            throw new Error(
                `selected release job ${job} ended ${results[job]?.result ?? 'missing'}`
            );
        }
    }
}

export function writeReleaseSummary({ summaryPath, verification, targets }) {
    if (typeof summaryPath !== 'string' || !summaryPath) {
        throw new Error('GITHUB_STEP_SUMMARY is required for release finalization');
    }
    if (!(verification && typeof verification.message === 'string')) {
        throw new Error('release verification result is missing its message');
    }
    const targetNames = ['computer', 'agent', 'app', 'ios', 'server'];
    assertRecord(targets, 'release target outcomes');
    const lines = [
        '## Coordinated release finalized',
        '',
        `${verification.message}.`,
        '',
        '| Target | Outcome |',
        '| --- | --- |',
        ...targetNames.map((target) => {
            if (targets[target] !== true && targets[target] !== false) {
                throw new Error(`release target outcome ${target} must be boolean`);
            }
            return (
                '| ' +
                capitalize(target) +
                ' | ' +
                (targets[target] ? 'published' : 'unchanged') +
                ' |'
            );
        }),
        '',
        targets.server
            ? 'Production Server deployed and publicly verified in this Release workflow.'
            : 'Production Server unchanged; no production promotion requested.',
        '',
    ];
    appendFileSync(summaryPath, lines.join('\n'));
}

function assertRecord(value, label) {
    if (!(value && typeof value === 'object' && !Array.isArray(value))) {
        throw new Error(`${label} must be an object`);
    }
}

function capitalize(value) {
    if (value === 'ios') {
        return 'iOS';
    }
    if (value === 'agent') {
        return 'Haus Agent';
    }
    return value[0].toUpperCase() + value.slice(1);
}

function requiredEnvironment(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required for release finalization`);
    }
    return value;
}

function booleanEnvironment(name) {
    const value = requiredEnvironment(name);
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    throw new Error(`${name} must be true or false`);
}

function ghApi(endpoint) {
    const output = execFileSync('gh', ['api', endpoint], {
        encoding: 'utf8',
        env: process.env,
    });
    try {
        return JSON.parse(output);
    } catch {
        throw new Error(`gh api returned malformed JSON for ${endpoint}`);
    }
}

function runGh(args, input) {
    return execFileSync('gh', args, {
        encoding: 'utf8',
        env: process.env,
        input,
        stdio: input === undefined ? 'ignore' : ['pipe', 'ignore', 'inherit'],
    });
}

async function main() {
    const repository = requiredEnvironment('GITHUB_REPOSITORY');
    const sourceRevision = requiredEnvironment('SOURCE_REVISION');
    const targets = {
        computer: booleanEnvironment('PUBLISH_COMPUTER'),
        agent: booleanEnvironment('PUBLISH_AGENT'),
        app: booleanEnvironment('PUBLISH_APP'),
        ios: booleanEnvironment('PUBLISH_IOS'),
        server: booleanEnvironment('PUBLISH_SERVER'),
    };
    if (targets.agent && !/^\d+\.\d+\.\d+$/u.test(requiredEnvironment('AGENT_VERSION'))) {
        throw new Error('AGENT_VERSION must be exact SemVer when Haus Agent publishes');
    }
    let jobResults;
    try {
        jobResults = JSON.parse(requiredEnvironment('RELEASE_JOB_RESULTS'));
    } catch {
        throw new Error('RELEASE_JOB_RESULTS must be valid JSON');
    }
    assertSelectedJobResults({ results: jobResults, targets });
    if (process.argv.includes('--preflight')) {
        console.log('Selected release jobs succeeded.');
        return;
    }
    const releaseVersion = requiredEnvironment('RELEASE_VERSION');
    ensureProductRelease({ repository, sourceRevision, releaseVersion, runGh });
    const productVerification = await verifyProductRelease({
        repository,
        sourceRevision,
        releaseVersion,
        ghApi,
    });
    let verification;
    if (targets.server) {
        verification = await verifyNormalRelease({
            repository,
            sourceRevision,
            releaseVersion,
            serverVersion: requiredEnvironment('SERVER_VERSION'),
            appVersion: targets.app ? requiredEnvironment('APP_VERSION') : undefined,
            publishApp: targets.app,
            ghApi,
        });
    } else if (targets.computer) {
        const computerVerification = await verifyComputerOnlyRelease({
            repository,
            sourceRevision,
            computerVersion: requiredEnvironment('COMPUTER_VERSION'),
            ghApi,
        });
        verification = {
            ...computerVerification,
            message: `${productVerification.message}; ${computerVerification.message}`,
        };
    } else {
        verification = productVerification;
    }
    writeReleaseSummary({
        summaryPath: requiredEnvironment('GITHUB_STEP_SUMMARY'),
        verification,
        targets,
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(
            'release finalization error: ' +
                (error instanceof Error ? error.message : String(error))
        );
        process.exitCode = 1;
    });
}
