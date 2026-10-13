import * as z from 'zod';

/**
 * Canonical shared-artifact drive paths (specs/artifact-drive.md). One module owns the rules so
 * API validation, Server, CLI, and App agree on what a path is and when two paths collide.
 */
export const artifactPathMaxLength = 1024;
export const artifactPathSegmentMaxLength = 255;

export type ArtifactPathProblem =
    | 'empty'
    | 'leading_slash'
    | 'trailing_slash'
    | 'empty_segment'
    | 'dot_segment'
    | 'invalid_character'
    | 'segment_too_long'
    | 'too_long';
export type ArtifactPathResult =
    | { ok: true; path: string }
    | { ok: false; problem: ArtifactPathProblem; message: string };

const forbiddenCharacter = /[\\\u0000-\u001f\u007f-\u009f]/u;
const messages: Record<ArtifactPathProblem, string> = {
    empty: 'Path is empty.',
    leading_slash: 'Path must be relative: drop the leading "/".',
    trailing_slash: 'Path names a file: drop the trailing "/".',
    empty_segment: 'Path has an empty segment ("//").',
    dot_segment: 'Path segments cannot be "." or "..".',
    invalid_character: 'Path cannot contain backslashes or control characters.',
    segment_too_long: `Each path segment is at most ${artifactPathSegmentMaxLength} characters.`,
    too_long: `Path is at most ${artifactPathMaxLength} characters.`,
};

/** NFC-normalizes and validates a drive path. Never rewrites anything but the normalization. */
export function parseArtifactPath(raw: string): ArtifactPathResult {
    const path = raw.normalize('NFC');
    const problem = artifactPathProblem(path);
    return problem ? { ok: false, problem, message: messages[problem] } : { ok: true, path };
}

/** Uniqueness key: two live paths collide when their keys are equal. */
export function artifactPathKey(path: string) {
    return path.normalize('NFC').toLowerCase();
}

export function artifactPathBasename(path: string) {
    return path.slice(path.lastIndexOf('/') + 1);
}

/** The folder holding `path`, or `''` at the drive root. */
export function artifactPathParent(path: string) {
    const slash = path.lastIndexOf('/');
    return slash < 0 ? '' : path.slice(0, slash);
}

/** Every folder above `path`, outermost first: `a/b/c.md` → `['a', 'a/b']`. */
export function artifactPathAncestors(path: string) {
    const segments = path.split('/');
    return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));
}

/** Whether `path` sits inside folder `folder` (compared by key). The root holds everything. */
export function artifactPathIsInside(path: string, folder: string) {
    return folder === '' || artifactPathKey(path).startsWith(`${artifactPathKey(folder)}/`);
}

/** A drive path, NFC-normalized. */
export const artifactPathSchema = z.string().transform((value, ctx) => {
    const result = parseArtifactPath(value);
    if (!result.ok) {
        ctx.addIssue({ code: 'custom', message: result.message });
        return z.NEVER;
    }
    return result.path;
});
/** A folder: `''` for the drive root, otherwise a drive path prefix. */
export const artifactFolderSchema = z.union([z.literal(''), artifactPathSchema]);

function artifactPathProblem(path: string): ArtifactPathProblem | null {
    if (path === '') {
        return 'empty';
    }
    if (path.length > artifactPathMaxLength) {
        return 'too_long';
    }
    if (forbiddenCharacter.test(path)) {
        return 'invalid_character';
    }
    if (path.startsWith('/')) {
        return 'leading_slash';
    }
    if (path.endsWith('/')) {
        return 'trailing_slash';
    }
    for (const segment of path.split('/')) {
        if (segment === '') {
            return 'empty_segment';
        }
        if (segment === '.' || segment === '..') {
            return 'dot_segment';
        }
        if (segment.length > artifactPathSegmentMaxLength) {
            return 'segment_too_long';
        }
    }
    return null;
}
