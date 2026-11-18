import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    assertRequiredTargetsSelected,
    calculateReleaseImpact,
    formatReleaseImpact,
} from './release-impact.mjs';

export const RELEASE_TARGETS = Object.freeze(['computer', 'agent', 'app', 'ios', 'server']);

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fullShaPattern = /^[0-9a-f]{40}$/u;
const semverPattern = /^\d+\.\d+\.\d+$/u;
const githubOutputName = 'GITHUB_OUTPUT';

export function validateDetectorPlan(plan) {
    assertRecord(plan, 'release plan');
    assertExactKeys(plan, ['initialLedgerMigration', 'targets'], 'release plan');
    if (typeof plan.initialLedgerMigration !== 'boolean') {
        throw new Error('release plan initialLedgerMigration must be boolean');
    }

    assertRecord(plan.targets, 'release plan targets');
    assertExactKeys(plan.targets, RELEASE_TARGETS, 'release plan targets');
    for (const target of RELEASE_TARGETS) {
        if (typeof plan.targets[target] !== 'boolean') {
            throw new Error(`release plan target ${target} must be boolean`);
        }
    }
    if (plan.initialLedgerMigration && RELEASE_TARGETS.some((target) => plan.targets[target])) {
        throw new Error('initial ledger migration must not request a release publication target');
    }
    return plan;
}

export function projectLedgerValues({ ledger, plan }) {
    validateDetectorPlan(plan);
    if (!Array.isArray(ledger) || ledger.length === 0) {
        throw new Error('releases.json must be a non-empty oldest-first array');
    }
    const latest = ledger.at(-1);
    assertRecord(latest, 'latest releases.json entry');
    assertRecord(latest.targets, 'latest releases.json targets');

    const values = {
        releaseVersion: '',
        serverVersion: '',
        appVersion: '',
        computerVersion: '',
        agentVersion: '',
        iosVersion: '',
        iosBuildNumber: '',
    };
    if (plan.initialLedgerMigration) {
        return values;
    }

    values.releaseVersion = readSemver(latest, ['version'], 'version');
    if (plan.targets.server) {
        values.serverVersion = readSemver(latest.targets, ['server'], 'targets.server');
    }
    if (plan.targets.computer) {
        values.computerVersion = readSemver(latest.targets, ['computer'], 'targets.computer');
    }
    if (plan.targets.agent) {
        values.agentVersion = readSemver(latest.targets, ['agent'], 'targets.agent');
        if (!(plan.targets.server && plan.targets.computer)) {
            throw new Error('Haus Agent publication requires Server and Computer publication');
        }
    }
    if (plan.targets.ios) {
        const ios = readPublished(readPath(latest.targets, ['ios']), 'targets.ios');
        assertRecord(ios, 'latest releases.json targets.ios');
        values.iosVersion = readSemver(ios, ['version'], 'targets.ios.version');
        values.iosBuildNumber = readBuildNumber(
            readPath(ios, ['buildNumber']),
            'targets.ios.buildNumber'
        );
    }
    if (plan.targets.app) {
        values.appVersion = readSemver(latest.targets, ['app'], 'targets.app');
    }
    return values;
}

export function writeReleaseOutputs({ rawPlan, plan, values, impact, outputPath, summaryPath }) {
    validateDetectorPlan(plan);
    if (typeof rawPlan !== 'string' || !rawPlan.trim()) {
        throw new Error('changed-release.mjs returned an empty release plan');
    }
    const output = requirePath(outputPath, 'GITHUB_OUTPUT');
    const summary = requirePath(summaryPath, 'GITHUB_STEP_SUMMARY');
    const delimiter = `haus_release_plan_${randomUUID()}`;
    appendFileSync(
        output,
        'plan<<' +
            delimiter +
            '\n' +
            rawPlan +
            (rawPlan.endsWith('\n') ? '' : '\n') +
            delimiter +
            '\n'
    );
    appendFileSync(
        output,
        [
            `initial_ledger_migration=${plan.initialLedgerMigration}`,
            ...RELEASE_TARGETS.map((target) => `publish_${target}=${plan.targets[target]}`),
            `release_version=${values.releaseVersion}`,
            `server_version=${values.serverVersion}`,
            `app_version=${values.appVersion}`,
            `computer_version=${values.computerVersion}`,
            `agent_version=${values.agentVersion}`,
            `ios_version=${values.iosVersion}`,
            `ios_build_number=${values.iosBuildNumber}`,
            '',
        ].join('\n')
    );
    appendFileSync(
        summary,
        [
            '### Release plan',
            '',
            `- Initial ledger migration: ${plan.initialLedgerMigration}`,
            ...RELEASE_TARGETS.map((target) => `- Publish ${target}: ${plan.targets[target]}`),
            ...(impact ? ['', formatReleaseImpact(impact)] : []),
            '',
        ].join('\n')
    );
}

function readPath(value, parts) {
    let current = value;
    for (const part of parts) {
        if (current === null || typeof current !== 'object' || !Object.hasOwn(current, part)) {
            return undefined;
        }
        current = current[part];
    }
    return current;
}

function readSemver(value, parts, label) {
    const candidate = readPublished(readPath(value, parts), label);
    if (typeof candidate !== 'string' || !semverPattern.test(candidate)) {
        throw new Error(`latest releases.json ${label} must be X.Y.Z, got ${String(candidate)}`);
    }
    return candidate;
}

function readBuildNumber(value, label) {
    const candidate = readPublished(value, label);
    const text = String(candidate);
    if (!/^[1-9]\d*$/u.test(text)) {
        throw new Error(`latest releases.json ${label} must be a positive integer, got ${text}`);
    }
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number <= 0) {
        throw new Error(
            `latest releases.json ${label} must be a safe positive integer, got ${text}`
        );
    }
    return text;
}

function readPublished(value, label) {
    if (value === undefined || value === null) {
        throw new Error(`latest releases.json entry is missing ${label}`);
    }
    if (value === 'undecided') {
        throw new Error(`latest releases.json entry has undecided ${label}`);
    }
    if (value === '' || value === false || value === 'unchanged') {
        throw new Error(`latest releases.json entry has invalid ${label}`);
    }
    return value;
}

function assertRecord(value, label) {
    if (!(value && typeof value === 'object' && !Array.isArray(value))) {
        throw new Error(`${label} must be an object`);
    }
}

function assertExactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    if (
        actual.length !== sortedExpected.length ||
        actual.some((key, index) => key !== sortedExpected[index])
    ) {
        throw new Error(`${label} has missing or unexpected fields`);
    }
}

function requirePath(value, name) {
    if (typeof value !== 'string' || !value) {
        throw new Error(`${name} is required for release workflow outputs`);
    }
    return value;
}

function readFlag(args, flag) {
    const index = args.indexOf(flag);
    const value = index === -1 ? undefined : args[index + 1];
    if (!value || value.startsWith('-')) {
        throw new Error(
            'usage: node scripts/release/release-plan.mjs --before <sha> --after <sha>'
        );
    }
    return value;
}

async function main() {
    const args = process.argv.slice(2);
    const before = readFlag(args, '--before');
    const after = readFlag(args, '--after');
    if (!(fullShaPattern.test(before) && fullShaPattern.test(after))) {
        throw new Error('release plan before and after must be full lowercase Git SHAs');
    }

    const detector = spawnSync(
        process.execPath,
        [
            path.join(repositoryRoot, 'scripts/release/changed-release.mjs'),
            '--before',
            before,
            '--after',
            after,
        ],
        { cwd: repositoryRoot, encoding: 'utf8' }
    );
    if (detector.error) {
        throw detector.error;
    }
    if (detector.status !== 0) {
        if (detector.stderr) {
            process.stderr.write(detector.stderr);
        }
        throw new Error('changed-release.mjs failed to calculate the release plan');
    }

    const rawPlan = detector.stdout;
    if (!rawPlan.trim()) {
        throw new Error('changed-release.mjs returned an empty release plan');
    }
    let plan;
    try {
        plan = JSON.parse(rawPlan);
    } catch {
        throw new Error('changed-release.mjs returned malformed JSON');
    }
    validateDetectorPlan(plan);

    let ledger;
    try {
        ledger = JSON.parse(readFileSync(path.join(repositoryRoot, 'releases.json'), 'utf8'));
    } catch {
        throw new Error('releases.json is missing or malformed');
    }
    const values = projectLedgerValues({ ledger, plan });
    const impact = plan.initialLedgerMigration
        ? null
        : await calculateReleaseImpact({ ledger, candidateRef: after });
    if (impact) {
        assertRequiredTargetsSelected({ impact, selectedTargets: plan.targets });
    }
    writeReleaseOutputs({
        rawPlan,
        plan,
        values,
        impact,
        outputPath: process.env[githubOutputName],
        summaryPath: process.env.GITHUB_STEP_SUMMARY,
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await main();
    } catch (error) {
        console.error(
            'release workflow plan error: ' +
                (error instanceof Error ? error.message : String(error))
        );
        process.exitCode = 1;
    }
}
