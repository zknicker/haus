import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
    AgentWorkspaceRequest,
    AgentWorkspaceResult,
    WorkspaceFileContent,
    WorkspaceFileEntry,
    WorkspaceFileList,
} from '@haus/api';
import { agentWorkspaceRequestSchema } from '@haus/api';
import {
    isVisibleWorkspaceEntry,
    normalizeWorkspacePath,
    rejectSensitiveWorkspacePath,
    rejectUnbrowseableWorkspacePath,
    resolveWorkspaceChild,
} from './workspace-file-paths.ts';
import { looksBinary } from './workspace-visibility.ts';

const imageExtensions = new Set(['.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const imageMaxBytes = 16 * 1024 * 1024;
const textSourceMaxBytes = 64 * 1024 * 1024;
const textPreviewMaxBytes = 512 * 1024;
const htmlPreviewMaxBytes = 5 * 1024 * 1024;

const languageByExtension: Record<string, string> = {
    '.c': 'c',
    '.conf': 'ini',
    '.cpp': 'cpp',
    '.css': 'css',
    '.csv': 'csv',
    '.go': 'go',
    '.graphql': 'graphql',
    '.h': 'c',
    '.hpp': 'cpp',
    '.html': 'html',
    '.java': 'java',
    '.js': 'javascript',
    '.json': 'json',
    '.jsx': 'jsx',
    '.log': 'text',
    '.lua': 'lua',
    '.md': 'markdown',
    '.mjs': 'javascript',
    '.py': 'python',
    '.rb': 'ruby',
    '.rs': 'rust',
    '.sh': 'shell',
    '.sql': 'sql',
    '.svg': 'xml',
    '.toml': 'toml',
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.txt': 'text',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.zsh': 'shell',
};

const mediaTypeByExtension: Record<string, string> = {
    '.bmp': 'image/bmp',
    '.css': 'text/css',
    '.csv': 'text/csv',
    '.gif': 'image/gif',
    '.htm': 'text/html',
    '.html': 'text/html',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.mjs': 'text/javascript',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.webp': 'image/webp',
    '.xml': 'application/xml',
};

export function parseAgentWorkspaceRequest(frame: unknown): AgentWorkspaceRequest | null {
    const parsed = agentWorkspaceRequestSchema.safeParse(frame);
    return parsed.success ? parsed.data : null;
}

/** Answers an Agent workspace request frame; returns false for any other frame. */
export function handleAgentWorkspaceRequest(
    frame: unknown,
    input: {
        dataRoot: string;
        send(frame: unknown): boolean;
        serverId: string;
        track<T>(work: Promise<T>): Promise<T>;
    }
): boolean {
    const request = parseAgentWorkspaceRequest(frame);
    if (!request) {
        return false;
    }
    void input.track(
        runAgentWorkspaceRequest({
            dataRoot: input.dataRoot,
            request,
            serverId: input.serverId,
        }).then((result) => input.send(result))
    );
    return true;
}

export async function runAgentWorkspaceRequest(input: {
    dataRoot: string;
    request: AgentWorkspaceRequest;
    serverId: string;
}): Promise<AgentWorkspaceResult> {
    try {
        const workspaceRoot = await fs.realpath(
            path.join(
                input.dataRoot,
                'servers',
                input.serverId,
                'agents',
                input.request.agentId,
                'workspace'
            )
        );
        const result =
            input.request.operation.kind === 'list'
                ? {
                      kind: 'list' as const,
                      value: await listWorkspaceFiles(
                          workspaceRoot,
                          input.request.operation.path,
                          input.request.operation.includeHidden
                      ),
                  }
                : {
                      kind: 'read' as const,
                      value: await readWorkspaceFile(
                          workspaceRoot,
                          input.request.operation.path,
                          input.request.operation.includeHidden
                      ),
                  };
        return {
            agentId: input.request.agentId,
            requestId: input.request.requestId,
            result,
            type: 'agent-workspace-result',
        };
    } catch (cause) {
        return {
            agentId: input.request.agentId,
            error: safeWorkspaceError(cause),
            requestId: input.request.requestId,
            type: 'agent-workspace-result',
        };
    }
}

export async function listWorkspaceFiles(
    workspaceRoot: string,
    requestedPath: string,
    includeHidden = false
): Promise<WorkspaceFileList> {
    const relativePath = normalizeWorkspacePath(requestedPath, true);
    rejectUnbrowseableWorkspacePath(relativePath, { includeHidden });
    const directory = await resolveWorkspaceChild(workspaceRoot, relativePath);
    const stat = await fs.stat(directory).catch(() => null);
    if (!stat?.isDirectory()) {
        throw new Error('Workspace directory does not exist.');
    }
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const visibleEntries = await Promise.all(
        entries
            .filter((entry) => isVisibleWorkspaceEntry(entry, includeHidden))
            .map((entry) => toWorkspaceEntry(workspaceRoot, relativePath, entry))
    );
    const files: WorkspaceFileEntry[] = [];
    for (const entry of visibleEntries) {
        if (entry) {
            files.push(entry);
        }
    }
    return {
        entries: files.sort(compareWorkspaceEntries),
        path: relativePath,
        workspaceRoot,
    };
}

export async function readWorkspaceFile(
    workspaceRoot: string,
    requestedPath: string,
    includeHidden = false
): Promise<WorkspaceFileContent> {
    const relativePath = normalizeWorkspacePath(requestedPath, false);
    rejectSensitiveWorkspacePath(relativePath);
    rejectUnbrowseableWorkspacePath(relativePath, { includeHidden });
    const absolutePath = await resolveWorkspaceChild(workspaceRoot, relativePath);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) {
        throw new Error('Workspace file does not exist.');
    }
    const extension = path.extname(relativePath).toLowerCase();
    const mediaType = mediaTypeForPath(relativePath);
    if (imageExtensions.has(extension)) {
        if (stat.size > imageMaxBytes) {
            throw new Error('Workspace image is too large to preview.');
        }
        return {
            binary: true,
            content: (await fs.readFile(absolutePath)).toString('base64'),
            encoding: 'base64',
            language: null,
            mediaType,
            path: relativePath,
            sizeBytes: stat.size,
            truncated: false,
            updatedAt: stat.mtime.toISOString(),
            workspaceRoot,
        };
    }
    if (stat.size > textSourceMaxBytes) {
        throw new Error('Workspace file is too large to preview.');
    }
    const previewMaxBytes = mediaType === 'text/html' ? htmlPreviewMaxBytes : textPreviewMaxBytes;
    const handle = await fs.open(absolutePath, 'r');
    try {
        const bytesToRead = Math.min(stat.size, previewMaxBytes);
        const buffer = Buffer.alloc(bytesToRead);
        const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
        const data = buffer.subarray(0, bytesRead);
        return {
            binary: looksBinary(data.subarray(0, Math.min(data.length, 4096))),
            content: data.toString('utf8'),
            encoding: 'utf8',
            language: languageByExtension[extension] ?? 'text',
            mediaType,
            path: relativePath,
            sizeBytes: stat.size,
            truncated: stat.size > previewMaxBytes,
            updatedAt: stat.mtime.toISOString(),
            workspaceRoot,
        };
    } finally {
        await handle.close();
    }
}

async function toWorkspaceEntry(root: string, parentPath: string, entry: Dirent) {
    if (entry.isSymbolicLink()) {
        return null;
    }
    const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
    const absolutePath = await resolveWorkspaceChild(root, relativePath).catch(() => null);
    const stat = absolutePath ? await fs.stat(absolutePath).catch(() => null) : null;
    if (!(stat && (stat.isDirectory() || stat.isFile()))) {
        return null;
    }
    return {
        kind: stat.isDirectory() ? ('directory' as const) : ('file' as const),
        mediaType: stat.isFile() ? mediaTypeForPath(relativePath) : null,
        name: entry.name,
        path: relativePath,
        sizeBytes: stat.isFile() ? stat.size : null,
        updatedAt: stat.mtime.toISOString(),
    };
}

function compareWorkspaceEntries(left: WorkspaceFileEntry, right: WorkspaceFileEntry) {
    if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
}

function mediaTypeForPath(filePath: string) {
    return mediaTypeByExtension[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

function safeWorkspaceError(cause: unknown) {
    const message = cause instanceof Error ? cause.message : 'Workspace request failed.';
    return message.slice(0, 300);
}
