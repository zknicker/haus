import { constants } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative } from 'node:path';

/** The Agent workspace folder a native image tool's saved file is copied into. */
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

/**
 * Native image tools save outside the Agent workspace: Codex under
 * `$CODEX_HOME/generated_images/<thread>/<call>.png`, Grok Build under
 * `~/.grok/sessions/<cwd>/<session>/images/<n>.jpg`, both inside the Agent's
 * isolated home. A finished generation or edit is copied into
 * `<workspace>/generated-images/` so the Agent and its humans find it where
 * they find everything else, and the journal records that workspace path in
 * place of the runtime's payload (Codex inlines the whole PNG as base64).
 */
export function createGeneratedImageSteps(input: {
    now?: () => Date;
    runtimeId: string;
    warn?: (message: string) => void;
    workspaceDir?: string;
}) {
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
                ? await copyIntoWorkspace({
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

/** Workspace-relative copy of `savedPath`, or `savedPath` itself when it cannot be copied. */
async function copyIntoWorkspace(input: {
    now: Date;
    savedPath: string;
    warn: (message: string) => void;
    workspaceDir: string;
}): Promise<string> {
    const inside = relative(input.workspaceDir, input.savedPath);
    if (inside && !inside.startsWith('..') && !isAbsolute(inside)) {
        return inside;
    }
    if (
        !(
            isAbsolute(input.savedPath) &&
            imageExtensions.has(extname(input.savedPath).toLowerCase())
        )
    ) {
        input.warn(
            `Generated image was not copied into the workspace: ${input.savedPath} is not an image file path.`
        );
        return input.savedPath;
    }
    const directory = join(input.workspaceDir, generatedImagesDirectoryName);
    const stamp = formatStamp(input.now);
    const name = basename(input.savedPath);
    try {
        await mkdir(directory, { recursive: true });
        for (let attempt = 1; ; attempt += 1) {
            const fileName = attempt === 1 ? `${stamp}-${name}` : `${stamp}-${attempt}-${name}`;
            try {
                // EXCL: a same-second, same-name image (Grok numbers per session) never overwrites.
                await copyFile(input.savedPath, join(directory, fileName), constants.COPYFILE_EXCL);
                return `${generatedImagesDirectoryName}/${fileName}`;
            } catch (error) {
                if (!(isNodeCode(error, 'EEXIST') && attempt < maxNameAttempts)) {
                    throw error;
                }
            }
        }
    } catch (error) {
        input.warn(
            `Generated image was not copied into the workspace from ${input.savedPath}: ${
                error instanceof Error ? error.message : String(error)
            }`
        );
        return input.savedPath;
    }
}

const maxNameAttempts = 20;
const imageExtensions = new Set(['.gif', '.jpeg', '.jpg', '.png', '.webp']);

/** Codex reports `savedPath`; Grok Build reports `path`. */
function readSavedPath(output: Record<string, unknown>): string | null {
    return readText(output.savedPath) ?? readText(output.path);
}

/** `20261006-130501`, in UTC, so copies sort by when they were made. */
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
