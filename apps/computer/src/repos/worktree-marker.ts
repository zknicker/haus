import { existsSync, realpathSync } from 'node:fs';
import { stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import { gitOutput, WorkerCheckoutError } from '../workers/computer/git.ts';
import { readJsonFile } from '../workers/durable-json.ts';

const markerSchema = z.object({ branch: z.string().min(1), ref: z.string().min(1).nullable() });
export type WorktreeMarker = z.infer<typeof markerSchema>;

const markerFile = 'haus-worktree.json';

export async function readMarker(path: string) {
    const dirs = await worktreeGitDirs(path);
    if (dirs === null) {
        return null;
    }
    const raw = await readJsonFile(join(dirs.admin, markerFile)).catch(() => null);
    const parsed = markerSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
}

export async function writeMarker(path: string, marker: WorktreeMarker) {
    const dirs = await worktreeGitDirs(path);
    if (dirs === null) {
        throw new WorkerCheckoutError(`${path} is not a git worktree.`);
    }
    await writeFile(join(dirs.admin, markerFile), `${JSON.stringify(marker)}\n`);
}

export async function touchWorktree(path: string, at = new Date()) {
    const dirs = await worktreeGitDirs(path);
    if (dirs !== null && existsSync(join(dirs.admin, markerFile))) {
        await utimes(join(dirs.admin, markerFile), at, at);
    }
}

export async function lastUseMs(path: string) {
    const dirs = await worktreeGitDirs(path);
    if (dirs === null) {
        return null;
    }
    const times = await Promise.all(
        [join(dirs.admin, markerFile), join(dirs.admin, 'index')].map((file) =>
            stat(file).then(
                (found) => found.mtimeMs,
                () => 0
            )
        )
    );
    return Math.max(...times);
}

export async function worktreeGitDirs(path: string) {
    if (!existsSync(join(path, '.git'))) {
        return null;
    }
    const read = (flag: string) => gitOutput(['rev-parse', '--path-format=absolute', flag], path);
    const [admin, common] = await Promise.all([read('--git-dir'), read('--git-common-dir')]);
    if (!(admin && common && existsSync(admin) && existsSync(common))) {
        return null;
    }
    return { admin, common: realpathSync(common) };
}
