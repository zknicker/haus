import { join } from 'node:path';

const pathSafeId = /^[A-Za-z0-9_-]{1,128}$/u;

export function reposRoot(dataRoot: string, serverId: string) {
    return join(dataRoot, 'servers', serverId, 'repos');
}

export function worktreesRoot(dataRoot: string, serverId: string) {
    return join(dataRoot, 'servers', serverId, 'worktrees');
}

export function worktreePath(dataRoot: string, serverId: string, id: string, repository: string) {
    if (!pathSafeId.test(id)) {
        throw new Error(`"${id}" cannot name a worktree folder.`);
    }
    const { name, owner } = repoParts(repository);
    return join(worktreesRoot(dataRoot, serverId), id, owner, name);
}

export function repoParts(repository: string) {
    const parts = repository.toLowerCase().split('/');
    const [owner, name] = parts;
    if (parts.length !== 2 || !(owner && name) || [owner, name].some(unsafePart)) {
        throw new Error(`"${repository}" cannot name a repository folder.`);
    }
    return { name, owner };
}

function unsafePart(part: string) {
    return part === '.' || part === '..' || !/^[a-z0-9._-]+$/u.test(part);
}
