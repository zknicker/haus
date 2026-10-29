import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudAgentLaunchRejectedError } from '../provider.ts';

/**
 * Runs `launch` inside a throwaway checkout of the requested repository at the
 * requested ref. Claude's `--cloud` launcher reads the repository and branch
 * from its working directory; a private checkout keeps every launch away from
 * the person's own clones. The checkout is removed afterwards either way.
 */
export async function withClaudeCheckout<T>(
    input: { ref: string | null; repository: string; signal?: AbortSignal },
    launch: (directory: string) => Promise<T>
): Promise<T> {
    if (!Bun.which('git')) {
        throw new CloudAgentLaunchRejectedError(
            'Install Git on this Computer before launching Claude cloud work.'
        );
    }
    const parent = await mkdtemp(join(tmpdir(), 'haus-claude-cloud-'));
    const directory = join(parent, 'repository');
    try {
        await clone(input.repository, directory, input.signal);
        const ref = input.ref ?? 'HEAD';
        const commit =
            (await resolveCommit(directory, ref, input.signal)) ??
            (await resolveCommit(directory, `origin/${ref}`, input.signal));
        if (!commit) {
            throw new CloudAgentLaunchRejectedError(
                `The starting ref ${ref} does not exist in ${input.repository}.`
            );
        }
        await git(
            directory,
            ['checkout', '--detach', commit],
            'check out the starting ref',
            input.signal
        );
        return await launch(directory);
    } finally {
        await rm(parent, { force: true, recursive: true });
    }
}

/** GitHub CLI's clone carries the Computer's GitHub sign-in; plain Git covers public repositories. */
async function clone(repository: string, directory: string, signal?: AbortSignal): Promise<void> {
    const url = `https://github.com/${repository}.git`;
    const command = Bun.which('gh')
        ? ['gh', 'repo', 'clone', url, directory, '--', '--no-checkout']
        : ['git', 'clone', '--no-checkout', url, directory];
    const child = Bun.spawn(command, {
        stderr: 'ignore',
        stdout: 'ignore',
        timeout: 120_000,
        signal,
        killSignal: 'SIGKILL',
    });
    if ((await child.exited) !== 0) {
        throw new CloudAgentLaunchRejectedError(
            `This Computer could not clone ${repository} with its GitHub access.`
        );
    }
}

async function git(
    directory: string,
    args: string[],
    action: string,
    signal?: AbortSignal
): Promise<void> {
    const child = Bun.spawn(['git', ...args], {
        cwd: directory,
        stderr: 'ignore',
        stdout: 'ignore',
        timeout: 30_000,
        signal,
        killSignal: 'SIGKILL',
    });
    if ((await child.exited) !== 0) {
        throw new CloudAgentLaunchRejectedError(`Could not ${action}.`);
    }
}

async function resolveCommit(
    directory: string,
    ref: string,
    signal?: AbortSignal
): Promise<string | null> {
    const child = Bun.spawn(
        ['git', 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
        {
            cwd: directory,
            stderr: 'ignore',
            stdout: 'pipe',
            timeout: 5000,
            signal,
            killSignal: 'SIGKILL',
        }
    );
    const output = (await new Response(child.stdout).text()).trim();
    return (await child.exited) === 0 && /^[a-f0-9]{40,64}$/u.test(output) ? output : null;
}
