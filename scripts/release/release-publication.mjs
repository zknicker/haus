import { spawnSync } from 'node:child_process';
import { fail, repoRoot } from './release-utils.mjs';

export function assertNoTag(tagName) {
    const localTag = spawnSync(
        'git',
        ['rev-parse', '--verify', '--quiet', `refs/tags/${tagName}`],
        {
            cwd: repoRoot,
            stdio: 'ignore',
        }
    );
    if (localTag.status === 0) {
        fail(`tag ${tagName} already exists locally`);
    }

    const remoteTag = spawnSync(
        'git',
        ['ls-remote', '--exit-code', 'origin', `refs/tags/${tagName}`],
        {
            cwd: repoRoot,
            encoding: 'utf8',
        }
    );
    if (remoteTag.status === 0) {
        fail(`tag ${tagName} already exists on origin`);
    }
}

export function createTag(tagName, sourceRevision) {
    run('git', releaseTagArgs(tagName, sourceRevision));
}

export function releaseTagArgs(tagName, sourceRevision) {
    return [
        '-c',
        'user.name=github-actions[bot]',
        '-c',
        'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'tag',
        '-a',
        tagName,
        sourceRevision,
        '-m',
        tagName,
    ];
}

export function pushReleaseTag(tagName) {
    run('git', ['push', 'origin', tagName]);
}

export function createGithubRelease({ artifacts, notesPath, tagName }) {
    run('gh', [
        'release',
        'create',
        tagName,
        ...artifacts,
        '--title',
        tagName,
        '--notes-file',
        notesPath,
        '--latest',
    ]);
}

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        env: process.env,
        stdio: 'inherit',
    });

    if (result.error) {
        fail(`${command} failed`, { message: result.error.message });
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}
