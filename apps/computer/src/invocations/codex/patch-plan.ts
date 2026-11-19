import { lstat, readFile, stat } from 'node:fs/promises';
import { existingFile } from '../files.ts';
import type { OperationContext } from '../operation.ts';
import { resolveMachinePath } from '../paths.ts';
import { updatedContents } from './file-update.ts';
import type { Hunk } from './parser.ts';

export interface PlannedFile {
    content: string | null;
    existed: boolean;
    mode?: number;
}

type PathContext = Pick<OperationContext, 'cwd' | 'env'>;

const ioReasons: Record<string, string> = {
    EACCES: 'Permission denied (os error 13)',
    EISDIR: 'Is a directory (os error 21)',
    ENOENT: 'No such file or directory (os error 2)',
};

export async function planPatch(hunks: readonly Hunk[], context: PathContext) {
    const files = new Map<string, PlannedFile>();
    const summary = { added: [] as string[], deleted: [] as string[], modified: [] as string[] };
    for (const hunk of hunks) {
        const path = resolveMachinePath(hunk.path, context);
        if (hunk.kind === 'add') {
            if (await occupied(files, path)) {
                return { refusal: `Failed to add file ${path}: the file already exists` };
            }
            plan(files, path, { content: hunk.contents, existed: false });
            summary.added.push(hunk.path);
            continue;
        }
        if (hunk.kind === 'delete') {
            if (!(await deletable(files, path))) {
                return { refusal: `Failed to delete file ${path}` };
            }
            plan(files, path, { content: null, existed: true });
            summary.deleted.push(hunk.path);
            continue;
        }
        const original = await updateTarget(files, path);
        if (original.refusal !== undefined) {
            return { refusal: original.refusal };
        }
        const updated = updatedContents(original.content, path, hunk.chunks);
        if (updated.refusal !== undefined) {
            return { refusal: updated.refusal };
        }
        if (hunk.movePath === null) {
            plan(files, path, { content: updated.content, existed: true });
            summary.modified.push(hunk.path);
            continue;
        }
        const destination = resolveMachinePath(hunk.movePath, context);
        if (await occupied(files, destination)) {
            return { refusal: `Failed to move ${path} to ${destination}: the file already exists` };
        }
        const mode = files.get(path)?.mode ?? (await existingFile(path))?.mode;
        plan(files, destination, { content: updated.content, existed: false, mode });
        plan(files, path, { content: null, existed: true });
        summary.modified.push(hunk.movePath);
    }
    return { files, summary };
}

function plan(files: Map<string, PlannedFile>, path: string, next: PlannedFile) {
    files.set(path, { ...next, existed: files.get(path)?.existed ?? next.existed });
}

async function occupied(files: Map<string, PlannedFile>, path: string) {
    const planned = files.get(path);
    if (planned) {
        return planned.content !== null;
    }
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (errorCode(error) === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

async function deletable(files: Map<string, PlannedFile>, path: string) {
    const planned = files.get(path);
    if (planned) {
        return planned.content !== null;
    }
    try {
        return !(await stat(path)).isDirectory();
    } catch {
        return false;
    }
}

async function updateTarget(files: Map<string, PlannedFile>, path: string) {
    const planned = files.get(path);
    if (planned) {
        return planned.content === null
            ? { refusal: `Failed to read file to update ${path}: ${ioReasons.ENOENT}` }
            : { content: planned.content };
    }
    let bytes: Uint8Array;
    try {
        bytes = await readFile(path);
    } catch (error) {
        const code = errorCode(error);
        if (!code) {
            throw error;
        }
        const reason = ioReasons[code] ?? (error as Error).message;
        return { refusal: `Failed to read file to update ${path}: ${reason}` };
    }
    try {
        return {
            content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
        };
    } catch {
        return {
            refusal: `Failed to read file to update ${path}: stream did not contain valid UTF-8`,
        };
    }
}

export function errorCode(error: unknown) {
    return error instanceof Error && 'code' in error && typeof error.code === 'string'
        ? error.code
        : null;
}
