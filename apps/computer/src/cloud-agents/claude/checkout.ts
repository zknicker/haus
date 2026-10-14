import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CloudAgentLaunchRejectedError } from '../provider.ts';
import type { ClaudeCloudComputer } from './bootstrap.ts';

/** Private launch checkouts never change the user's repository or Cursor configuration. */
export async function prepareClaudeCloudCheckout(
    computer: ClaudeCloudComputer,
    input: {
        repository: string;
        ref: string | null;
        runId: string;
    }
): Promise<string> {
    if (!(Bun.which('gh') && Bun.which('git'))) {
        throw new CloudAgentLaunchRejectedError(
            'Install Git and GitHub CLI on this Computer before launching Claude Cloud work.'
        );
    }
    const parent = join(
        computer.dataRoot,
        'servers',
        computer.serverId,
        'claude-cloud',
        'checkouts'
    );
    const directory = join(parent, createHash('sha256').update(input.runId).digest('hex'));
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const clone = Bun.spawn(
        [
            'gh',
            'repo',
            'clone',
            `https://github.com/${input.repository}.git`,
            directory,
            '--',
            '--no-checkout',
        ],
        {
            stdout: 'ignore',
            stderr: 'ignore',
            timeout: 60_000,
        }
    );
    if ((await clone.exited) !== 0) {
        throw new CloudAgentLaunchRejectedError(
            "Could not clone the requested repository through this Computer's GitHub access."
        );
    }
    const ref = input.ref ?? 'HEAD';
    const commit =
        (await resolveCommit(directory, ref)) ?? (await resolveCommit(directory, `origin/${ref}`));
    if (!commit) {
        throw new CloudAgentLaunchRejectedError(
            'The requested starting ref could not be resolved.'
        );
    }
    const checkout = Bun.spawn(['git', 'checkout', '--detach', commit], {
        cwd: directory,
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 30_000,
    });
    if ((await checkout.exited) !== 0) {
        throw new CloudAgentLaunchRejectedError(
            'The requested starting ref could not be checked out.'
        );
    }
    return directory;
}

async function resolveCommit(directory: string, ref: string): Promise<string | null> {
    const command = Bun.spawn(
        ['git', 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`],
        {
            cwd: directory,
            stdout: 'pipe',
            stderr: 'ignore',
            timeout: 5000,
        }
    );
    const output = (await new Response(command.stdout).text()).trim();
    return (await command.exited) === 0 && /^[a-f0-9]{40,64}$/u.test(output) ? output : null;
}
