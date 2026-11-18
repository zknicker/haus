import { execFileSync, spawnSync } from 'node:child_process';
import { computerProtocolVersion } from './computer-release-contract.mjs';
import { fail, repoRoot } from './release-utils.mjs';

export function ensureComputerReleaseTag(version, sourceRevision) {
    const tag = computerReleaseTag(version);
    if (localTagExists(tag)) {
        const tagged = execFileSync('git', ['rev-list', '-n', '1', tag], {
            cwd: repoRoot,
            encoding: 'utf8',
        }).trim();
        if (tagged !== sourceRevision) {
            fail(`tag ${tag} already points at ${tagged}`);
        }
    } else {
        run('git', ['tag', '-a', tag, '-m', tag, sourceRevision]);
    }
    if (!remoteTagExists(tag)) {
        run('git', ['push', 'origin', tag]);
    }
}

export function ensureComputerGithubRelease(version, input) {
    const tag = computerReleaseTag(version);
    if (githubReleaseExists(tag)) {
        console.log(`Reusing existing GitHub Release: ${tag}`);
        return;
    }
    run('gh', [
        'release',
        'create',
        tag,
        ...input.assets,
        '--title',
        tag,
        '--notes',
        `Signed Haus Computer ${version} (protocol ${computerProtocolVersion}, ${input.sourceRevision}).`,
    ]);
}

export function assertComputerReleaseTagAbsent(version) {
    const tag = computerReleaseTag(version);
    if (localTagExists(tag)) {
        fail(`tag ${tag} already exists locally`);
    }
    if (remoteTagExists(tag)) {
        fail(`tag ${tag} already exists on origin`);
    }
}

function computerReleaseTag(version) {
    return `computer-v${version}`;
}

function localTagExists(tag) {
    return (
        spawnSync('git', ['rev-parse', '--verify', `refs/tags/${tag}`], {
            cwd: repoRoot,
            stdio: 'ignore',
        }).status === 0
    );
}

function remoteTagExists(tag) {
    return (
        spawnSync('git', ['ls-remote', '--exit-code', 'origin', `refs/tags/${tag}`], {
            cwd: repoRoot,
            stdio: 'ignore',
        }).status === 0
    );
}

function githubReleaseExists(tag) {
    return (
        spawnSync('gh', ['release', 'view', tag], { cwd: repoRoot, stdio: 'ignore' }).status === 0
    );
}

function run(command, args) {
    execFileSync(command, args, { cwd: repoRoot, env: process.env, stdio: 'inherit' });
}
