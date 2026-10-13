import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArtifactPath } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import { ARTIFACT_MANIFEST_NAME } from './artifact-manifest.ts';

/** Suffix of the incoming copy a pull writes beside a file that has local edits. */
export const THEIRS_SUFFIX = '.haus-theirs';
/** Names `push` never uploads, at any depth. */
const ignoredNames = new Set([
    '.DS_Store',
    '.git',
    '__pycache__',
    'node_modules',
    ARTIFACT_MANIFEST_NAME,
]);
/** Leftovers of an interrupted atomic write (`writeFileAtomic`). */
const atomicTemp = /\.tmp-\d+-[a-f0-9]{8}$/u;

export function isIgnoredName(name: string): boolean {
    return ignoredNames.has(name) || name.endsWith(THEIRS_SUFFIX) || atomicTemp.test(name);
}

export async function sha256File(file: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file)) {
        hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
}

/** Sha256 of a local regular file, or null when nothing is there. Refuses symlinks. */
export async function localFileSha(file: string): Promise<string | null> {
    const stat = await fs.lstat(file).catch(() => null);
    if (!stat) {
        return null;
    }
    if (!stat.isFile()) {
        throw new AgentCliError(
            'INVALID_ARG',
            `${file} is not a regular file; refusing to overwrite it.`
        );
    }
    return sha256File(file);
}

/**
 * Maps a drive-relative path to a file under `root`, creating parent folders. Refuses anything
 * that would land outside `root`: dot segments, absolute paths, symlinked folders, a symlink at
 * the target, and the manifest itself.
 */
export async function localTargetUnder(root: string, relative: string): Promise<string> {
    const parsed = parseArtifactPath(relative);
    if (!parsed.ok) {
        throw unsafe(relative, parsed.message);
    }
    const segments = parsed.path.split('/');
    if (segments.includes(ARTIFACT_MANIFEST_NAME)) {
        throw unsafe(relative, `${ARTIFACT_MANIFEST_NAME} is reserved for bookkeeping.`);
    }
    const base = await fs.realpath(root);
    let current = base;
    for (const segment of segments.slice(0, -1)) {
        current = path.join(current, segment);
        const stat = await fs.lstat(current).catch(() => null);
        if (!stat) {
            await fs.mkdir(current);
        } else if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw unsafe(relative, `${current} is not a plain folder.`);
        }
    }
    const target = path.join(current, segments.at(-1) ?? '');
    const inside = path.relative(base, target);
    if (inside.startsWith('..') || path.isAbsolute(inside)) {
        throw unsafe(relative, 'it resolves outside the target folder.');
    }
    for (const candidate of [target, `${target}${THEIRS_SUFFIX}`]) {
        const stat = await fs.lstat(candidate).catch(() => null);
        if (stat && !stat.isFile()) {
            throw unsafe(relative, `${candidate} exists and is not a regular file.`);
        }
    }
    return target;
}

/** Every regular file under `directory`, skipping symlinks and the built-in noise names. */
export async function walkLocalFiles(
    directory: string
): Promise<{ files: string[]; skipped: string[] }> {
    const files: string[] = [];
    const skipped: string[] = [];
    const pending = [path.resolve(directory)];
    while (pending.length > 0) {
        const current = pending.pop() as string;
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (isIgnoredName(entry.name)) {
                continue;
            }
            if (entry.isDirectory()) {
                pending.push(full);
            } else if (entry.isFile()) {
                files.push(full);
            } else {
                skipped.push(full);
            }
        }
    }
    return { files: files.sort(), skipped: skipped.sort() };
}

/** Joins drive path parts, ignoring empty ones (`''` is the drive root). */
export function joinDrivePath(...parts: string[]): string {
    return parts.filter((part) => part !== '').join('/');
}

/** A path relative to the working directory, for commands the agent can paste. */
export function displayPath(file: string): string {
    const relative = path.relative(process.cwd(), file);
    return relative === '' ? '.' : relative.startsWith('..') ? file : relative;
}

/** Shell-quotes an argument when it needs it. */
export function shellArg(value: string): string {
    return /^[\w./@%+=:,-]+$/u.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

function unsafe(relative: string, reason: string) {
    return new AgentCliError('INVALID_PATH', `Refusing to write ${relative}: ${reason}`);
}
