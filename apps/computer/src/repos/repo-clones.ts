import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { hasCode } from '../durable-json.ts';
import { githubRepositoryOfRemote, readOrigin, RepoCheckoutError } from './git.ts';

export async function verifyRepoFolder(path: string, repository: string) {
    if (!existsSync(path)) {
        throw new RepoCheckoutError(`The repo folder ${path} is gone.`);
    }
    const url = await readOrigin(path);
    if (url === null) {
        throw new RepoCheckoutError(`${path} has no origin remote.`);
    }
    if (githubRepositoryOfRemote(url) !== repository.toLowerCase()) {
        throw new RepoCheckoutError(`${path} is a clone of ${url}, not ${repository}.`);
    }
}

export async function directories(path: string) {
    try {
        const entries = await readdir(path, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isDirectory() && !isStagingClone(entry.name))
            .map((entry) => entry.name)
            .sort();
    } catch (cause) {
        if (hasCode(cause, 'ENOENT')) {
            return [];
        }
        throw cause;
    }
}

function isStagingClone(name: string) {
    return name.startsWith('.') && name.endsWith('.clone');
}
