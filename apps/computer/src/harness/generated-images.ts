import { constants } from 'node:fs';
import { copyFile, link, lstat, mkdir, rename, symlink, unlink } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative } from 'node:path';

/** The Agent workspace folder a native image tool's saved file is moved into. */
export const generatedImagesDirectoryName = 'generated-images';

export type NativeImageToolAction = 'edit' | 'generate' | 'video';

/**
 * Runtime-native media tools by wire name. Codex's `image_gen.imagegen` reaches
 * the stream as codex-acp's untitled "Image generation" call, which
 * `codexBuiltinTools` names `image_gen`; Grok Build's builtins keep their own
 * names (@ai-sdk/harness-grok-build 1.0.70).
 */
export const nativeImageToolFixtures = {
    codex: { image_gen: 'generate' },
    'grok-build': {
        image_edit: 'edit',
        image_gen: 'generate',
        image_to_video: 'video',
        reference_to_video: 'video',
    },
} as const satisfies Record<string, Readonly<Record<string, NativeImageToolAction>>>;

export function nativeImageToolAction(
    runtimeId: string,
    toolName: string
): NativeImageToolAction | undefined {
    const tools: Readonly<Record<string, NativeImageToolAction>> | undefined =
        nativeImageToolFixtures[runtimeId as keyof typeof nativeImageToolFixtures];
    return tools?.[toolName];
}

/** File operations the move uses; injectable so tests can force cross-device and failure paths. */
export interface GeneratedImageFs {
    copyFile: typeof copyFile;
    link: typeof link;
    lstat: typeof lstat;
    mkdir: typeof mkdir;
    rename: typeof rename;
    symlink: typeof symlink;
    unlink: typeof unlink;
}

const nodeFs: GeneratedImageFs = { copyFile, link, lstat, mkdir, rename, symlink, unlink };

/**
 * Native image tools save outside the Agent workspace: Codex under
 * `$CODEX_HOME/generated_images/<thread>/<call>.png`, Grok Build under
 * `~/.grok/sessions/<cwd>/<session>/images/<n>.jpg`, both inside the Agent's
 * isolated home. A finished generation or edit is moved into
 * `<workspace>/generated-images/` so the Agent and its humans find it where
 * they find everything else, and a symlink at the runtime's path keeps the
 * runtime's own references (Grok `image_edit` inputs, Codex `savedPath`)
 * working. The journal records the workspace path in place of the runtime's
 * payload (Codex inlines the whole PNG as base64).
 */
export function createGeneratedImageSteps(input: {
    fs?: GeneratedImageFs;
    now?: () => Date;
    runtimeId: string;
    warn?: (message: string) => void;
    workspaceDir?: string;
}) {
    const fs = input.fs ?? nodeFs;
    const warn = input.warn ?? ((message: string) => console.warn(message));
    return {
        /** The output to journal for a finished call; any other tool's passes through. */
        async settle(toolName: string, output: unknown, failed: boolean): Promise<unknown> {
            const action = nativeImageToolAction(input.runtimeId, toolName);
            if (!action || action === 'video' || failed || !isRecord(output)) {
                return output;
            }
            const savedPath = readSavedPath(output);
            const revisedPrompt = readText(output.revisedPrompt);
            const journaled = revisedPrompt ? { revisedPrompt } : {};
            if (!savedPath) {
                return journaled;
            }
            const path = input.workspaceDir
                ? await moveIntoWorkspace({
                      fs,
                      now: input.now?.() ?? new Date(),
                      savedPath,
                      warn,
                      workspaceDir: input.workspaceDir,
                  })
                : savedPath;
            return { ...journaled, path, savedPath };
        },
    };
}

/**
 * Workspace-relative path `savedPath` was moved to, or `savedPath` itself when
 * it was not moved. The original is only ever replaced, atomically, by the
 * symlink once the workspace file exists, so every failure leaves the image at
 * the runtime path.
 */
async function moveIntoWorkspace(input: {
    fs: GeneratedImageFs;
    now: Date;
    savedPath: string;
    warn: (message: string) => void;
    workspaceDir: string;
}): Promise<string> {
    const { fs, savedPath } = input;
    const inside = relative(input.workspaceDir, savedPath);
    if (inside && !inside.startsWith('..') && !isAbsolute(inside)) {
        return inside;
    }
    if (!(isAbsolute(savedPath) && imageExtensions.has(extname(savedPath).toLowerCase()))) {
        input.warn(
            `Generated image was not moved into the workspace: ${savedPath} is not an image file path.`
        );
        return savedPath;
    }
    let target: string | null = null;
    let pending: string | null = null;
    try {
        if (!(await fs.lstat(savedPath)).isFile()) {
            throw new Error('not a regular file');
        }
        const directory = join(input.workspaceDir, generatedImagesDirectoryName);
        await fs.mkdir(directory, { recursive: true });
        const fileName = await placeInWorkspace(fs, savedPath, directory, input.now);
        target = join(directory, fileName);
        const linkPath = `${savedPath}.haus-link-${process.pid}-${Date.now()}`;
        await fs.symlink(target, linkPath);
        pending = linkPath;
        // Swap the symlink over the original in one step; the image is never absent.
        await fs.rename(linkPath, savedPath);
        return `${generatedImagesDirectoryName}/${fileName}`;
    } catch (error) {
        const notes = [
            error instanceof Error ? error.message : String(error),
            ...(await removeLeftovers(fs, [pending, target])),
        ];
        input.warn(
            `Generated image was not moved into the workspace from ${savedPath}: ${notes.join('; ')}`
        );
        return savedPath;
    }
}

/**
 * Puts `savedPath`'s bytes at a fresh workspace name. A hard link is an
 * exclusive same-filesystem rename (plain rename would overwrite a
 * same-second, same-name image; Grok numbers per session); across devices or
 * on filesystems without links, an exclusive copy stands in.
 */
async function placeInWorkspace(
    fs: GeneratedImageFs,
    savedPath: string,
    directory: string,
    now: Date
): Promise<string> {
    const stamp = formatStamp(now);
    const name = basename(savedPath);
    for (let attempt = 1; ; attempt += 1) {
        const fileName = attempt === 1 ? `${stamp}-${name}` : `${stamp}-${attempt}-${name}`;
        const target = join(directory, fileName);
        try {
            await fs.link(savedPath, target).catch((error: unknown) => {
                if (isNodeCode(error, 'EEXIST')) {
                    throw error;
                }
                return fs.copyFile(savedPath, target, constants.COPYFILE_EXCL);
            });
            return fileName;
        } catch (error) {
            if (!(isNodeCode(error, 'EEXIST') && attempt < maxNameAttempts)) {
                throw error;
            }
        }
    }
}

/**
 * Drops the pending symlink and the workspace file after a failed swap so the
 * image stays in one place; returns a note for each leftover it could not remove.
 */
async function removeLeftovers(
    fs: GeneratedImageFs,
    paths: readonly (string | null)[]
): Promise<string[]> {
    const notes: string[] = [];
    for (const path of paths) {
        if (!path) {
            continue;
        }
        try {
            await fs.unlink(path);
        } catch (error) {
            notes.push(
                `${path} could not be removed: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    return notes;
}

const maxNameAttempts = 20;
const imageExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);

/** Codex reports `savedPath`; Grok Build reports `path`. */
function readSavedPath(output: Record<string, unknown>): string | null {
    return readText(output.savedPath) ?? readText(output.path);
}

/** `20261006-130501`, in UTC, so moved images sort by when they were made. */
function formatStamp(date: Date): string {
    return date.toISOString().slice(0, 19).replace(/[-:]/gu, '').replace('T', '-');
}

function readText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeCode(error: unknown, code: string) {
    return error instanceof Error && 'code' in error && error.code === code;
}
