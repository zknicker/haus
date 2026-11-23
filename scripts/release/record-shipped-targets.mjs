import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shippedTargetTag } from './release-impact.mjs';
import { releaseTagArgs } from './release-publication.mjs';
import { repoRoot } from './release-utils.mjs';

export const releaseTargetJobs = Object.freeze({
    computer: ['publish_computer'],
    app: ['publish_app'],
    ios: ['upload_ios'],
    server: ['publish_server', 'promote_server'],
});

const shippedTargetOrder = ['computer', 'app', 'ios', 'server', 'agent'];

export function shippedTargets({ results, targets }) {
    const jobsSucceeded = (target) =>
        releaseTargetJobs[target].every((job) => results[job]?.result === 'success');
    const shipped = new Set(
        Object.keys(releaseTargetJobs).filter((target) => targets[target] && jobsSucceeded(target))
    );
    if (targets.agent && shipped.has('server') && shipped.has('computer')) {
        shipped.add('agent');
    }
    return shippedTargetOrder.filter((target) => shipped.has(target));
}

export function recordShippedTargets({ targets, releaseVersion, sourceRevision, git }) {
    const outcomes = [];
    for (const target of targets) {
        if (target === 'computer') {
            outcomes.push({ target, tag: 'computer-v*', outcome: 'tagged by Publish Computer' });
            continue;
        }
        const tag = shippedTargetTag(target, releaseVersion);
        const existing = git.remoteTagRevision(tag);
        if (existing === sourceRevision) {
            outcomes.push({ target, tag, outcome: 'already recorded' });
            continue;
        }
        if (existing) {
            throw new Error(`${tag} already points at ${existing}, not ${sourceRevision}`);
        }
        git.pushTag(tag, sourceRevision);
        outcomes.push({ target, tag, outcome: 'recorded' });
    }
    return outcomes;
}

export function formatShippedTargets(outcomes) {
    return [
        '## Shipped target baselines',
        '',
        ...(outcomes.length === 0
            ? ['No selected target shipped.']
            : outcomes.map(({ target, tag, outcome }) => `- ${target}: \`${tag}\` ${outcome}`)),
        '',
    ].join('\n');
}

export function remoteTagRevision(tag, lsRemote = runLsRemote) {
    const lines = lsRemote(tag)
        .split('\n')
        .map((line) => line.trim().split(/\s+/u))
        .filter(([revision, ref]) => revision && ref);
    const peeled = lines.find(([, ref]) => ref === `refs/tags/${tag}^{}`);
    const direct = lines.find(([, ref]) => ref === `refs/tags/${tag}`);
    return (peeled ?? direct)?.[0] ?? null;
}

const gitTags = {
    remoteTagRevision: (tag) => remoteTagRevision(tag),
    pushTag: (tag, sourceRevision) => {
        git(releaseTagArgs(tag, sourceRevision));
        git(['push', 'origin', `refs/tags/${tag}`]);
    },
};

function runLsRemote(tag) {
    const result = spawnSync(
        'git',
        ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`],
        { cwd: repoRoot, encoding: 'utf8' }
    );
    if (result.status !== 0) {
        throw new Error(`git ls-remote failed for ${tag}: ${result.stderr.trim()}`);
    }
    return result.stdout;
}

function git(args) {
    execFileSync('git', args, { cwd: repoRoot, stdio: 'inherit' });
}

function requiredEnvironment(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required to record shipped targets`);
    }
    return value;
}

function main() {
    const results = JSON.parse(requiredEnvironment('RELEASE_JOB_RESULTS'));
    const targets = Object.fromEntries(
        shippedTargetOrder.map((target) => [
            target,
            requiredEnvironment(`PUBLISH_${target.toUpperCase()}`) === 'true',
        ])
    );
    const outcomes = recordShippedTargets({
        targets: shippedTargets({ results, targets }),
        releaseVersion: requiredEnvironment('RELEASE_VERSION'),
        sourceRevision: requiredEnvironment('SOURCE_REVISION'),
        git: gitTags,
    });
    appendFileSync(requiredEnvironment('GITHUB_STEP_SUMMARY'), formatShippedTargets(outcomes));
    console.log(formatShippedTargets(outcomes));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error(
            'record shipped targets error: ' +
                (error instanceof Error ? error.message : String(error))
        );
        process.exitCode = 1;
    }
}
