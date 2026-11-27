import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { hasCode } from '../durable-json.ts';
import { reposRoot, worktreesRoot } from './layout.ts';
import { directories } from './repo-clones.ts';
import { removeCleanWorktreesOf } from './worktree.ts';

export async function releasePartitionWorktrees(dataRoot: string, serverId: string) {
    const root = worktreesRoot(dataRoot, serverId);
    const clones = reposRoot(dataRoot, serverId);
    const keep = new Set<string>();
    for (const id of await directories(root)) {
        const kept = await removeCleanWorktreesOf(root, id, {
            credentials: id.startsWith('agt_') ? 'fetched' : 'machine',
            deleteBranch: false,
        });
        for (const path of kept) {
            keep.add(path);
            const clone = cloneOf(await folderOf(path), clones);
            if (clone) {
                keep.add(clone);
            }
        }
    }
    return [...keep].sort();
}

function cloneOf(folder: string | null, clones: string) {
    if (folder === null) {
        return null;
    }
    for (const base of new Set([clones, existsSync(clones) ? realpathSync(clones) : clones])) {
        const inside = relative(base, folder);
        if (inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)) {
            return join(clones, inside);
        }
    }
    return null;
}

async function folderOf(worktree: string) {
    const pointer = await readFile(join(worktree, '.git'), 'utf8').catch((cause: unknown) => {
        if (hasCode(cause, 'ENOENT') || hasCode(cause, 'EISDIR')) {
            return null;
        }
        throw cause;
    });
    const gitdir = pointer?.match(/^gitdir: (.+)$/mu)?.[1]?.trim();
    if (!gitdir) {
        return null;
    }
    const admin = isAbsolute(gitdir) ? gitdir : resolve(worktree, gitdir);
    return dirname(dirname(dirname(admin)));
}
