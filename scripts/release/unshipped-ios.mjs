import { execFileSync } from 'node:child_process';
import { isSemver, repoRoot } from './release-utils.mjs';

const tagPrefix = 'unshipped/ios/v';
const refPrefix = `refs/tags/${tagPrefix}`;

export function unshippedIOSTag(version) {
    if (!isSemver(version)) {
        throw new Error(`invalid Haus release version ${version}`);
    }
    return `${tagPrefix}${version}`;
}

export function iosUploadFailed({ results, targets }) {
    return targets.ios === true && results.upload_ios?.result !== 'success';
}

export function readUnshippedIOSVersions({ cwd = repoRoot } = {}) {
    const output = git(['ls-remote', '--tags', 'origin', `${refPrefix}*`], cwd);
    const versions = new Set();
    for (const line of output.split('\n')) {
        if (!line.trim()) {
            continue;
        }
        const ref = line.split('\t')[1] ?? '';
        const version = ref.slice(refPrefix.length).replace(/\^\{\}$/u, '');
        if (!(ref.startsWith(refPrefix) && isSemver(version))) {
            throw new Error(`unexpected unshipped iOS tag ${ref}`);
        }
        versions.add(version);
    }
    return [...versions].sort();
}

export function recordUnshippedIOS({ version, sourceRevision, cwd = repoRoot }) {
    const tag = unshippedIOSTag(version);
    if (!/^[0-9a-f]{40}$/u.test(sourceRevision ?? '')) {
        throw new Error('unshipped iOS source revision must be a full lowercase Git SHA');
    }
    if (readUnshippedIOSVersions({ cwd }).includes(version)) {
        return false;
    }
    git(['push', 'origin', `${sourceRevision}:refs/tags/${tag}`], cwd);
    return true;
}

function git(args, cwd) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
    });
}
