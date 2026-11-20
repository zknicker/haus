import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { serialized } from '../serialized.ts';
import { repositoryOfRemote, runGit, WorkerCheckoutError } from './git.ts';
import { repoClonePath } from './layout.ts';

export interface RepoSource {
    checkoutPath: string | null;
    repository: string;
}

export interface RepoOptions {
    dataRoot: string;
    remoteUrl?: (repository: string) => string;
    signal?: AbortSignal;
}

const githubUrl = (repository: string) => `https://github.com/${repository}.git`;

export async function resolveWorkerRepo(source: RepoSource, options: RepoOptions) {
    if (source.checkoutPath !== null) {
        await verifyOrigin(source.checkoutPath, source.repository, options.signal);
        return source.checkoutPath;
    }
    const destination = repoClonePath(options.dataRoot, source.repository);
    return await serialized(`repo:${destination}`, async () => {
        if (!existsSync(join(destination, '.git'))) {
            await cloneInto(destination, source.repository, options);
        }
        await verifyOrigin(destination, source.repository, options.signal);
        return destination;
    });
}

async function verifyOrigin(path: string, repository: string, signal?: AbortSignal) {
    if (!existsSync(path)) {
        throw new WorkerCheckoutError(`The linked checkout ${path} does not exist.`);
    }
    const url = await runGit(['remote', 'get-url', 'origin'], {
        action: `read the origin of ${path}`,
        cwd: path,
        signal,
    });
    if (repositoryOfRemote(url) !== repository.toLowerCase()) {
        throw new WorkerCheckoutError(`${path} is a clone of ${url}, not ${repository}.`);
    }
}

async function cloneInto(destination: string, repository: string, options: RepoOptions) {
    const parent = dirname(destination);
    await mkdir(parent, { mode: 0o700, recursive: true });
    const temporary = join(parent, `.${basename(destination)}.${randomUUID()}.clone`);
    const url = (options.remoteUrl ?? githubUrl)(repository);
    try {
        await clone(url, temporary, options.signal);
        await rename(temporary, destination).catch((cause: unknown) => {
            if (!existsSync(join(destination, '.git'))) {
                throw cause;
            }
        });
    } finally {
        await rm(temporary, { force: true, recursive: true });
    }
}

async function clone(url: string, directory: string, signal?: AbortSignal) {
    const gh = url.startsWith('https://github.com/') ? Bun.which('gh') : null;
    const command = gh
        ? [gh, 'repo', 'clone', url, directory, '--', '--filter=blob:none']
        : ['git', 'clone', '--filter=blob:none', url, directory];
    const child = Bun.spawn(command, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        killSignal: 'SIGKILL',
        signal,
        stderr: 'ignore',
        stdin: 'ignore',
        stdout: 'ignore',
        timeout: 600_000,
    });
    if ((await child.exited) !== 0) {
        throw new WorkerCheckoutError(
            `This Computer could not clone ${url} with its GitHub access.`
        );
    }
}
