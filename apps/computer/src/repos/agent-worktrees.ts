import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { agentRepoBranch, agentWorktreeIdleMs } from '@haus/api';
import { type GitCredentials, runGit, WorkerCheckoutError } from '../workers/computer/git.ts';
import { worktreePath, worktreesRoot } from '../workers/computer/layout.ts';
import { verifyRepoFolder } from '../workers/computer/repos.ts';
import { withAgentCleanup } from './agent-use.ts';
import { type GithubAppGit, githubAppGit } from './github-git.ts';
import {
    lastUseMs,
    readMarker,
    touchWorktree,
    worktreeGitDirs,
    writeMarker,
} from './worktree-marker.ts';
import {
    addWorktree,
    hasLocalWork,
    listWorktrees,
    removeCleanWorktree,
    removeCleanWorktreesOf,
    startPoint,
    withFolderLock,
    worktreeState,
} from './worktree.ts';

export interface AgentCheckout {
    agentId: string;
    dataRoot: string;
    folder: string;
    git: GithubAppGit;
    ref: string | null;
    repository: string;
    serverId: string;
    signal?: AbortSignal;
}

export async function checkoutAgentWorktree(input: AgentCheckout) {
    await verifyRepoFolder(input.folder, input.repository);
    const path = worktreePath(input.dataRoot, input.serverId, input.agentId, input.repository);
    const branch = agentRepoBranch(input.agentId, input.repository);
    const existing = existsSync(join(path, '.git'));
    if (existing && (await worktreeGitDirs(path)) === null) {
        throw new WorkerCheckoutError(
            `The worktree at ${path} no longer belongs to ${input.folder}. Move any work out of it and delete it, then check out again.`
        );
    }
    const before = existing ? await readMarker(path) : null;
    await runGit(['fetch', '--quiet', 'origin'], {
        action: `fetch ${input.repository} into ${input.folder}`,
        credentials: input.git,
        cwd: input.folder,
        signal: input.signal,
    });
    const added = await addWorktree({
        branch,
        credentials: input.git,
        fetch: 'done',
        folder: input.folder,
        path,
        ref: input.ref,
        signal: input.signal,
    });
    const { ref } = input;
    const moved =
        ref !== null && (added.created ? added.branchKept : before?.ref !== ref)
            ? await resetAgentWorktree({ ...input, branch, path, ref })
            : null;
    await touchWorktree(path);
    return {
        branch,
        from: moved?.from ?? added.start,
        path,
        reused: !added.created,
    };
}
export type AgentCheckoutReceipt = Awaited<ReturnType<typeof checkoutAgentWorktree>>;

export function agentCheckoutText(receipt: AgentCheckoutReceipt) {
    const days = agentWorktreeIdleMs / 86_400_000;
    return [
        `${receipt.reused ? 'Reused' : 'Made'} the worktree ${receipt.path} on ${receipt.branch}, from ${receipt.from}.`,
        `Run \`cd ${receipt.path}\` to work there. Once nothing in it is uncommitted or unpushed, it goes ${days} days after its last use; the branch stays.`,
    ].join('\n');
}

export async function pruneIdleAgentWorktrees(input: {
    dataRoot: string;
    now?: number;
    serverId: string;
}) {
    const root = worktreesRoot(input.dataRoot, input.serverId);
    const now = input.now ?? Date.now();
    const removed: string[] = [];
    const idle = async (path: string) => {
        const last = await lastUseMs(path);
        return last !== null && now - last >= agentWorktreeIdleMs;
    };
    for (const worktree of await listWorktrees(root)) {
        if (!(isAgentId(worktree.id) && (await idle(worktree.path)))) {
            continue;
        }
        const credentials = cleanupGit(input, worktree.id);
        if ((await worktreeState(worktree.path, credentials)) !== 'clean') {
            continue;
        }
        const state = await withAgentCleanup(worktree.id, async () =>
            (await idle(worktree.path))
                ? await removeCleanWorktree({
                      credentials: 'fetched',
                      deleteBranch: false,
                      path: worktree.path,
                      root,
                  })
                : 'in-use'
        );
        if (state === 'clean') {
            removed.push(worktree.path);
        }
    }
    return removed;
}

export function removeAgentWorktrees(input: {
    agentId: string;
    dataRoot: string;
    serverId: string;
}) {
    return removeCleanWorktreesOf(worktreesRoot(input.dataRoot, input.serverId), input.agentId, {
        credentials: cleanupGit(input, input.agentId),
        deleteBranch: false,
    });
}

export function agentWorktreeOf(path: string, root: string) {
    const inside = relative(root, resolve(path));
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
        return null;
    }
    const [id, owner, name] = inside.split(sep);
    return id && owner && name && isAgentId(id) ? join(root, id, owner, name) : null;
}

export async function touchAgentWorktreeAt(path: string, root: string) {
    const worktree = agentWorktreeOf(path, root);
    if (worktree !== null) {
        await touchWorktree(worktree);
    }
}

function cleanupGit(scope: { dataRoot: string; serverId: string }, agentId: string) {
    const credentials: GitCredentials = githubAppGit(scope.dataRoot, scope.serverId, {
        access: 'read',
        agentId,
    });
    return credentials;
}

function isAgentId(id: string) {
    return id.startsWith('agt_');
}

async function resetAgentWorktree(
    input: AgentCheckout & { branch: string; path: string; ref: string }
) {
    return await withFolderLock(input.folder, async () => {
        if (await hasLocalWork(input.path)) {
            throw new WorkerCheckoutError(
                `${input.path} has uncommitted or unpushed work on ${input.branch}, so it was not moved to ${input.ref}. Commit and push it first, or check out without --ref.`
            );
        }
        const from = await startPoint({
            credentials: input.git,
            folder: input.folder,
            ref: input.ref,
        });
        await runGit(['reset', '--hard', '--quiet', from], {
            action: `move ${input.branch} to ${input.ref}`,
            cwd: input.path,
            signal: input.signal,
        });
        await writeMarker(input.path, { branch: input.branch, ref: input.ref });
        return { from };
    });
}
