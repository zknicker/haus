import { ownedPrefixes } from './release-impact-paths.mjs';
import {
    assertReleaseLedger,
    releasePublishesTarget,
    releaseTargetVersion,
} from './release-ledger.mjs';
import { runGit } from './release-utils.mjs';
import { unshippedIOSTag } from './unshipped-ios.mjs';

export const releaseImpactTargets = ['server', 'app', 'ios', 'computer', 'agent'];

const reviewPrefixes = {
    server: [
        'packages/haus-api/',
        'packages/agent-manual/package.json',
        'apps/server/package.json',
        'apps/website/package.json',
        'bun.lock',
        'package.json',
        'patches/',
    ],
    app: [
        'packages/haus-api/',
        'apps/website/electron-builder.config.cjs',
        'apps/website/package.json',
        'bun.lock',
        'package.json',
        'patches/',
    ],
    ios: [
        'packages/haus-api/',
        'apps/ios-swift/project.yml',
        'apps/ios-swift/Haus.xcodeproj/project.pbxproj',
    ],
    computer: ['packages/haus-api/', 'bun.lock', 'package.json', 'patches/'],
    agent: [
        'apps/runner/src/activity/agent-activity.ts',
        'apps/computer/src/index.ts',
        'apps/computer/package.json',
        'apps/server/src/agent-delivery/',
        'apps/server/src/computers/socket.ts',
        'apps/server/src/server-agents/',
        'packages/agent-manual/package.json',
        'packages/agent-workspace/package.json',
        'packages/haus-api/package.json',
        'bun.lock',
        'package.json',
        'patches/',
    ],
};

export async function calculateReleaseImpact({
    ledger,
    candidateRef = 'HEAD',
    resolveTag = resolveGitTag,
    resolveReleaseCommit = resolveRecordedReleaseCommit,
    listChangedFiles = readChangedFiles,
}) {
    assertReleaseLedger(ledger);
    const targets = {};
    for (const target of releaseImpactTargets) {
        const baseline = await findReleaseBaseline({
            ledger,
            target,
            resolveTag,
            resolveReleaseCommit,
        });
        const changedFiles = await listChangedFiles(baseline.sourceRevision, candidateRef);
        const ownedFiles = changedFiles.filter((file) => isOwnedFile(target, file));
        const reviewFiles = changedFiles.filter(
            (file) => !ownedFiles.includes(file) && isReviewFile(target, file)
        );
        targets[target] = {
            baseline,
            status:
                ownedFiles.length > 0 ? 'changed' : reviewFiles.length > 0 ? 'review' : 'unchanged',
            ownedFiles,
            reviewFiles,
        };
    }
    return { candidateRef, targets };
}

export function formatReleaseImpact(impact) {
    const lines = ['## Release target impact', ''];
    for (const target of releaseImpactTargets) {
        const result = impact.targets[target];
        lines.push(`### ${targetLabel(target)} — ${statusLabel(result.status)}`);
        lines.push('');
        lines.push(`- Baseline: ${result.baseline.tag} (${result.baseline.sourceRevision})`);
        for (const file of result.ownedFiles) {
            lines.push(`- Changed: ${file}`);
        }
        for (const file of result.reviewFiles) {
            lines.push(`- Review: ${file}`);
        }
        if (result.status === 'unchanged') {
            lines.push('- No owned shipping inputs changed.');
        }
        lines.push('');
    }
    return lines.join('\n').trimEnd();
}

async function findReleaseBaseline({ ledger, target, resolveTag, resolveReleaseCommit }) {
    for (let index = ledger.length - 1; index >= 0; index -= 1) {
        const entry = ledger[index];
        if (!releasePublishesTarget(entry, target)) {
            continue;
        }
        if (
            target === 'ios' &&
            entry.version &&
            (await resolveTag(unshippedIOSTag(entry.version)))
        ) {
            continue;
        }
        for (const tag of targetTags(entry, target)) {
            const sourceRevision = await resolveTag(tag);
            if (sourceRevision) {
                return { tag, sourceRevision };
            }
        }
        if (target !== 'computer' && index < ledger.length - 1 && entry.version) {
            const recordedRevision = await resolveReleaseCommit(entry.version);
            if (recordedRevision) {
                return { tag: `release:v${entry.version}`, sourceRevision: recordedRevision };
            }
        }
    }
    if (target === 'agent') {
        for (let index = ledger.length - 1; index >= 0; index -= 1) {
            const entry = ledger[index];
            if (!entry.version) {
                continue;
            }
            const tag = `v${entry.version}`;
            const sourceRevision =
                (await resolveTag(tag)) ?? (await resolveReleaseCommit(entry.version));
            if (sourceRevision) {
                return { tag: `initial:${tag}`, sourceRevision };
            }
        }
    }
    throw new Error(`could not resolve a recorded ${target} release source`);
}

export function shippedTargetTag(target, releaseVersion) {
    return `release/${target}/v${releaseVersion}`;
}

function targetTags(entry, target) {
    if (target === 'computer') {
        const version = releaseTargetVersion(entry, target);
        return version ? [`computer-v${version}`] : [];
    }
    return entry.version ? [`v${entry.version}`, shippedTargetTag(target, entry.version)] : [];
}

async function resolveGitTag(tag) {
    try {
        const { stdout } = await runGit(['rev-parse', '--verify', `${tag}^{commit}`]);
        const revision = stdout.trim();
        return /^[0-9a-f]{40}$/u.test(revision) ? revision : null;
    } catch {
        return null;
    }
}

async function resolveRecordedReleaseCommit(version) {
    const { stdout } = await runGit([
        'log',
        '--format=%H',
        '--extended-regexp',
        '--grep',
        `^release: v${version}( |$)`,
        '-n',
        '1',
    ]);
    const revision = stdout.trim();
    return /^[0-9a-f]{40}$/u.test(revision) ? revision : null;
}

async function readChangedFiles(before, after) {
    const { stdout } = await runGit([
        'diff',
        '--name-only',
        '--diff-filter=ACDMRTUXB',
        `${before}..${after}`,
        '--',
    ]);
    return stdout
        .split('\n')
        .map((file) => file.trim())
        .filter(Boolean);
}

function isOwnedFile(target, file) {
    if (isNonShippingFile(file)) {
        return false;
    }
    return ownedPrefixes[target].some((prefix) => matchesPath(file, prefix));
}

function isReviewFile(target, file) {
    if (isNonShippingFile(file)) {
        return false;
    }
    return reviewPrefixes[target].some((prefix) => matchesPath(file, prefix));
}

function isNonShippingFile(file) {
    return (
        /(^|\/)(test|tests|e2e|fixtures|__snapshots__)(\/|$)/u.test(file) ||
        /\.test\.[^/]+$/u.test(file) ||
        /(^|\/)README\.md$/u.test(file) ||
        file.startsWith('docs/') ||
        file.startsWith('specs/') ||
        file.startsWith('.agents/') ||
        file.startsWith('.github/')
    );
}

function matchesPath(file, prefix) {
    return prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix;
}

function targetLabel(target) {
    return {
        server: 'Server',
        app: 'App',
        ios: 'iOS',
        computer: 'Computer',
        agent: 'Haus Agent',
    }[target];
}

function statusLabel(status) {
    return { changed: 'changed', review: 'agent review', unchanged: 'unchanged' }[status];
}
