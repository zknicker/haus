import { dirname, join } from 'node:path';
import type { DriveFolderLayout } from '../../drive/folder-state.ts';

const pathSafeId = /^[A-Za-z0-9_-]{1,128}$/u;

export function workersRoot(dataRoot: string, serverId: string) {
    return join(dataRoot, 'servers', serverId, 'workers');
}

export function workerLayout(dataRoot: string, serverId: string, workerId: string) {
    return workerLayoutIn(workersRoot(dataRoot, serverId), workerId);
}

export function workerLayoutIn(workersFolder: string, workerId: string) {
    if (!pathSafeId.test(workerId)) {
        throw new Error(`"${workerId}" cannot name a Worker folder.`);
    }
    const root = join(workersFolder, workerId);
    const runtime = join(root, 'runtime');
    return {
        bin: join(runtime, 'bin'),
        drive: join(root, 'drive'),
        report: join(runtime, 'report'),
        reportFile: join(runtime, 'report', 'receipt.json'),
        root,
        tmp: join(runtime, 'tmp'),
        turnsFile: join(runtime, 'turns.json'),
        workerId,
        driveFolder: (writer: string) =>
            ({
                folder: join(root, 'drive'),
                refused: join(dirname(workersFolder), 'worker-drive-refused', workerId),
                scratch: join(runtime, 'drive-scratch'),
                stateFile: join(runtime, 'drive.json'),
                writer,
            }) satisfies DriveFolderLayout,
    };
}
export type WorkerLayout = ReturnType<typeof workerLayout>;

export function reposRoot(dataRoot: string, serverId: string) {
    return join(dataRoot, 'servers', serverId, 'repos');
}

export function repoClonePath(dataRoot: string, serverId: string, repository: string) {
    const { name, owner } = repoParts(repository);
    return join(reposRoot(dataRoot, serverId), owner, name);
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
