import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    isHiddenWorkspaceName,
    isSensitiveWorkspacePath,
    isSkippedWorkspaceDirectory,
} from './workspace-visibility.ts';

export function normalizeWorkspacePath(value: string, allowEmpty: boolean) {
    const trimmed = value.trim().replaceAll('\\', '/');
    if (!trimmed) {
        if (allowEmpty) {
            return '';
        }
        throw new Error('Workspace path is required.');
    }
    if (trimmed.startsWith('/')) {
        throw new Error('Workspace path must be relative.');
    }
    const segments = trimmed.split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        throw new Error('Workspace path must stay inside the workspace.');
    }
    return path.posix.normalize(trimmed);
}

export function isVisibleWorkspaceEntry(entry: Dirent, includeHidden: boolean) {
    if (entry.isDirectory() && isSkippedWorkspaceDirectory(entry.name)) {
        return false;
    }
    if (isSensitiveWorkspacePath(entry.name)) {
        return false;
    }
    return includeHidden || !isHiddenWorkspaceName(entry.name);
}

export function rejectUnbrowseableWorkspacePath(
    relativePath: string,
    options: { includeHidden: boolean }
) {
    for (const segment of relativePath.split('/').filter(Boolean)) {
        if (
            isSkippedWorkspaceDirectory(segment) ||
            (!options.includeHidden && isHiddenWorkspaceName(segment))
        ) {
            throw new Error('Workspace path is not browseable.');
        }
    }
}

export function rejectSensitiveWorkspacePath(relativePath: string) {
    if (isSensitiveWorkspacePath(relativePath)) {
        throw new Error(
            'Workspace file is blocked because it may contain secrets or key material.'
        );
    }
}

export async function resolveWorkspaceChild(root: string, relativePath: string) {
    const candidate = path.resolve(root, ...relativePath.split('/').filter(Boolean));
    const realPath = await fs.realpath(candidate);
    if (!(realPath === root || realPath.startsWith(`${root}${path.sep}`))) {
        throw new Error('Workspace path must stay inside the workspace.');
    }
    return realPath;
}
