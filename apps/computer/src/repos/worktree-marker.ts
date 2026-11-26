import { existsSync, realpathSync } from 'node:fs';
import { readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import { gitOutput, RepoCheckoutError } from './git.ts';
import { readJsonFile } from '../durable-json.ts';

const markerSchema = z.object({ branch: z.string().min(1), ref: z.string().min(1).nullable() });
export type WorktreeMarker = z.infer<typeof markerSchema>;

const markerFile = 'haus-worktree.json';
const generationFile = 'haus-session-generation';

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
        throw new RepoCheckoutError(`${path} is not a git worktree.`);
    }
    await writeFile(join(dirs.admin, markerFile), `${JSON.stringify(marker)}\n`);
}

export async function touchWorktree(path: string, at = new Date()) {
    const dirs = await worktreeGitDirs(path);
    if (dirs !== null && existsSync(join(dirs.admin, markerFile))) {
        await utimes(join(dirs.admin, markerFile), at, at);
    }
}

export async function markSessionGeneration(path: string, generation: number) {
    const dirs = await worktreeGitDirs(path);
    if (dirs === null) {
        return;
    }
    const newest = Math.max(generation, (await readSessionGeneration(path)) ?? 0);
    await writeFile(join(dirs.admin, generationFile), `${newest}\n`);
}

export async function readSessionGeneration(path: string) {
    const dirs = await worktreeGitDirs(path);
    if (dirs === null) {
        return null;
    }
    const raw = await readFile(join(dirs.admin, generationFile), 'utf8').catch(() => null);
    const generation = Number(raw?.trim());
    return Number.isInteger(generation) && generation > 0 ? generation : null;
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
