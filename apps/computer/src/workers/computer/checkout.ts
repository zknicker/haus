import {
    addWorktree,
    commonDirOf,
    listWorktrees,
    removeCleanWorktreesOf,
} from '../../repos/worktree.ts';
import { worktreesRoot } from './layout.ts';
import { directories } from './repos.ts';

export interface WorkerWorktreeRequest {
    branch: string;
    folder: string;
    path: string;
    signal?: AbortSignal;
    startingRef: string | null;
}

export function addWorkerWorktree(request: WorkerWorktreeRequest) {
    return addWorktree({
        branch: request.branch,
        credentials: 'machine',
        fetch: 'required',
        folder: request.folder,
        path: request.path,
        ref: request.startingRef,
        signal: request.signal,
    });
}

export async function worktreeGitRoots(path: string) {
    return [await commonDirOf(path)];
}

export function closeWorkerWorktrees(dataRoot: string, serverId: string, workerId: string) {
    return removeCleanWorktreesOf(worktreesRoot(dataRoot, serverId), workerId, {
        credentials: 'machine',
        deleteBranch: true,
    });
}

export async function heldWorkerWorktrees(
    dataRoot: string,
    serverId: string,
    journaled: readonly string[]
) {
    const root = worktreesRoot(dataRoot, serverId);
    const workerFolders = (await directories(root)).filter(isWorkerId);
    const kept = (await listWorktrees(root)).filter(
        (worktree) => isWorkerId(worktree.id) && !journaled.includes(worktree.id)
    );
    return {
        keptWorktrees: kept.map((worktree) => ({ path: worktree.path, workerId: worktree.id })),
        workerIds: [...new Set([...journaled, ...workerFolders])].sort(),
    };
}

export function isWorkerId(id: string) {
    return !id.startsWith('agt_');
}
