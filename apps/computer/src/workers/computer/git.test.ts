import { afterEach, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitSucceeds, githubRepositoryOfRemote } from './git.ts';

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

function sshRepo() {
    const root = mkdtempSync(join(tmpdir(), 'haus-git-'));
    roots.push(root);
    const repo = join(root, 'repo');
    const marker = join(root, 'machine-ssh-ran');
    const ssh = join(root, 'machine-ssh');
    writeFileSync(ssh, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`);
    chmodSync(ssh, 0o755);
    Bun.spawnSync(['git', 'init', '--quiet', repo]);
    Bun.spawnSync(['git', '-C', repo, 'config', 'core.sshCommand', ssh]);
    Bun.spawnSync([
        'git',
        '-C',
        repo,
        'remote',
        'add',
        'origin',
        'ssh://git@127.0.0.1:1/acme/app.git',
    ]);
    return { marker, repo };
}

test("a Captain's git never runs the machine's SSH setup; a Worker's does", async () => {
    const captain = sshRepo();
    const worker = sshRepo();

    expect(await gitSucceeds(['fetch', '--quiet', 'origin'], captain.repo, 'none')).toBe(false);
    expect(await gitSucceeds(['fetch', '--quiet', 'origin'], worker.repo, 'machine')).toBe(false);
    expect(existsSync(captain.marker)).toBe(false);
    expect(existsSync(worker.marker)).toBe(true);
});

test('only github.com remotes name a repo, and a .github repo is one', () => {
    expect(githubRepositoryOfRemote('git@github.com:Acme/.github.git')).toBe('acme/.github');
    expect(githubRepositoryOfRemote('https://github.com/acme/app')).toBe('acme/app');
    expect(githubRepositoryOfRemote('ssh://git@github.com:22/Acme/App.git')).toBe('acme/app');
    expect(githubRepositoryOfRemote('ssh://git@github.com:2222/acme/app.git')).toBeNull();
    expect(githubRepositoryOfRemote('https://gitlab.com/acme/app.git')).toBeNull();
    expect(githubRepositoryOfRemote('git@github.com:acme/...git')).toBeNull();
});
