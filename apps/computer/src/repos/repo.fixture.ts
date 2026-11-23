import { afterEach } from 'bun:test';
import { mkdtempSync, realpathSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const githubUrl = 'https://github.com/acme/app.git';

export function git(cwd: string, ...args: string[]) {
    const result = Bun.spawnSync(
        ['git', '-c', 'user.name=Test', '-c', 'user.email=test@haus.test', ...args],
        { cwd, stderr: 'pipe', stdout: 'pipe' }
    );
    if (result.exitCode !== 0) {
        throw new Error(`git ${args.join(' ')}: ${result.stderr.toString()}`);
    }
    return result.stdout.toString().trim();
}

export function registerRepoFixture() {
    const roots: string[] = [];
    afterEach(async () => {
        for (const root of roots.splice(0)) {
            Bun.spawnSync(['chmod', '-R', 'u+w', root]);
            await rm(root, { force: true, recursive: true });
        }
    });
    return () => {
        const root = realpathSync(mkdtempSync(join(tmpdir(), 'haus-repos-')));
        roots.push(root);
        const remote = join(root, 'remotes', 'acme', 'app.git');
        const seed = join(root, 'seed');
        git(root, 'init', '--quiet', '--initial-branch', 'main', seed);
        git(seed, 'commit', '--quiet', '--allow-empty', '-m', 'first');
        git(seed, 'checkout', '--quiet', '-b', 'feature');
        git(seed, 'commit', '--quiet', '--allow-empty', '-m', 'feature work');
        git(seed, 'checkout', '--quiet', 'main');
        git(root, 'clone', '--quiet', '--bare', seed, remote);
        const dataRoot = join(root, 'data');
        return {
            dataRoot,
            remote,
            root,
            folder: (path = join(root, 'code', 'app')) => {
                git(root, 'clone', '--quiet', remote, path);
                git(path, 'remote', 'set-url', 'origin', githubUrl);
                git(path, 'config', `url.${remote}.insteadOf`, githubUrl);
                git(path, 'fetch', '--quiet', 'origin');
                git(path, 'remote', 'set-head', 'origin', 'main');
                return path;
            },
            cutOff: (path: string) => {
                git(path, 'config', `url.${join(root, 'nowhere')}.insteadOf`, githubUrl);
                git(path, 'config', '--unset', `url.${remote}.insteadOf`);
            },
            remoteUrl: (repository: string) => join(root, 'remotes', `${repository}.git`),
        };
    };
}
