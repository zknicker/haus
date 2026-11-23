import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { hasCode } from '../durable-json.ts';
import { serialized } from '../serialized.ts';
import { githubRepositoryOfRemote, readOrigin, WorkerCheckoutError } from './git.ts';
import { repoClonePath, reposRoot } from './layout.ts';

export interface RepoSource {
    checkoutPath: string | null;
    repository: string;
}

export interface RepoOptions {
    dataRoot: string;
    onCloned?: () => Promise<void>;
    remoteUrl?: (repository: string) => string;
    serverId: string;
    signal?: AbortSignal;
}

const githubUrl = (repository: string) => `https://github.com/${repository}.git`;

export async function resolveWorkerRepo(source: RepoSource, options: RepoOptions) {
    if (source.checkoutPath !== null) {
        await verifyRepoFolder(source.checkoutPath, source.repository);
        return source.checkoutPath;
    }
    const destination = repoClonePath(options.dataRoot, options.serverId, source.repository);
    return await serialized(`repo:${destination}`, async () => {
        if (!existsSync(join(destination, '.git'))) {
            await cloneInto(destination, source.repository, options);
            await options.onCloned?.();
        }
        await verifyRepoFolder(destination, source.repository);
        return destination;
    });
}

export async function verifyRepoFolder(path: string, repository: string) {
    if (!existsSync(path)) {
        throw new WorkerCheckoutError(`The repo folder ${path} is gone.`);
    }
    const url = await readOrigin(path);
    if (url === null) {
        throw new WorkerCheckoutError(`${path} has no origin remote.`);
    }
    if (githubRepositoryOfRemote(url) !== repository.toLowerCase()) {
        throw new WorkerCheckoutError(`${path} is a clone of ${url}, not ${repository}.`);
    }
}

export async function listHausClones(dataRoot: string, serverId: string) {
    const root = reposRoot(dataRoot, serverId);
    const clones: Array<{ path: string; repository: string }> = [];
    for (const owner of await directories(root)) {
        for (const name of await directories(join(root, owner))) {
            const path = join(root, owner, name);
            const url = existsSync(join(path, '.git')) ? await readOrigin(path) : null;
            const repository = url === null ? null : githubRepositoryOfRemote(url);
            if (repository === `${owner}/${name}`) {
                clones.push({ path, repository });
            }
        }
    }
    return clones;
}

export async function directories(path: string) {
    try {
        const entries = await readdir(path, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
            .map((entry) => entry.name)
            .sort();
    } catch (cause) {
        if (hasCode(cause, 'ENOENT')) {
            return [];
        }
        throw cause;
    }
}

async function cloneInto(destination: string, repository: string, options: RepoOptions) {
    const parent = dirname(destination);
    await mkdir(parent, { mode: 0o700, recursive: true });
    const temporary = join(parent, `.${basename(destination)}.${randomUUID()}.clone`);
    try {
        await clone(repository, temporary, options);
        await rename(temporary, destination).catch((cause: unknown) => {
            if (!existsSync(join(destination, '.git'))) {
                throw cause;
            }
        });
    } finally {
        await rm(temporary, { force: true, recursive: true });
    }
}

async function clone(repository: string, directory: string, options: RepoOptions) {
    const url = githubUrl(repository);
    const source = options.remoteUrl?.(repository);
    const gh = source === undefined ? Bun.which('gh') : null;
    const rewrite = source === undefined ? [] : ['-c', `url.${source}.insteadOf=${url}`];
    const command = gh
        ? [gh, 'repo', 'clone', url, directory, '--', '--filter=blob:none']
        : ['git', 'clone', ...rewrite, '--filter=blob:none', url, directory];
    const child = Bun.spawn(command, {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        killSignal: 'SIGKILL',
        signal: options.signal,
        stderr: 'ignore',
        stdin: 'ignore',
        stdout: 'ignore',
        timeout: 600_000,
    });
    if ((await child.exited) !== 0) {
        throw new WorkerCheckoutError(
            `This Computer could not clone ${repository} with its GitHub access.`
        );
    }
}
