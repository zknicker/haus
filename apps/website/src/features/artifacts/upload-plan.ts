import { artifactPathAncestors, artifactPathKey, parseArtifactPath } from '@haus/api';

/** One picked or dropped file and where it sat inside the pick: `a.png` or `photos/a.png`. */
export interface UploadSource<F> {
    file: F;
    relativePath: string;
}

export interface PlannedUpload<F> {
    file: F;
    path: string;
}

export interface RejectedUpload {
    message: string;
    path: string;
}

/**
 * What an upload into one folder will do: files at free paths, files that
 * would replace an existing one (asked once, all together), files whose bytes
 * already are the current revision (skipped, like `haus files push`), files
 * refused before any bytes move, and how many OS noise files were dropped
 * silently.
 */
export interface UploadPlan<F> {
    additions: PlannedUpload<F>[];
    rejected: RejectedUpload[];
    replacements: PlannedUpload<F>[];
    skippedNoise: number;
    unchanged: PlannedUpload<F>[];
}

/**
 * Plans an upload of `sources` into `folder` against the drive paths that
 * already live under it. Paths follow the shared rules (`parseArtifactPath`)
 * and collide by key, as the Server compares them; a file can never sit
 * where a folder is, or under a file.
 */
export function planArtifactUpload<F>(
    sources: readonly UploadSource<F>[],
    folder: string,
    existingPaths: readonly string[]
): UploadPlan<F> {
    const existingFiles = new Set(existingPaths.map(artifactPathKey));
    const existingFolders = new Set(
        existingPaths.flatMap((path) => artifactPathAncestors(path).map(artifactPathKey))
    );
    const plan: UploadPlan<F> = {
        additions: [],
        rejected: [],
        replacements: [],
        skippedNoise: 0,
        unchanged: [],
    };
    const accepted: PlannedUpload<F>[] = [];
    const acceptedKeys = new Set<string>();

    for (const source of sources) {
        if (isNoisePath(source.relativePath)) {
            plan.skippedNoise += 1;
            continue;
        }
        const raw = folder ? `${folder}/${source.relativePath}` : source.relativePath;
        const parsed = parseArtifactPath(raw);
        if (!parsed.ok) {
            plan.rejected.push({ message: parsed.message, path: raw });
            continue;
        }
        const problem = conflict(parsed.path, { acceptedKeys, existingFiles, existingFolders });
        if (problem) {
            plan.rejected.push({ message: problem, path: parsed.path });
            continue;
        }
        acceptedKeys.add(artifactPathKey(parsed.path));
        accepted.push({ file: source.file, path: parsed.path });
    }

    for (const upload of accepted) {
        // A file in this upload cannot also be a folder another file in it lands under.
        const shadowed = artifactPathAncestors(upload.path).find((ancestor) =>
            acceptedKeys.has(artifactPathKey(ancestor))
        );
        if (shadowed) {
            plan.rejected.push({
                message: `"${shadowed}" is also uploaded as a file.`,
                path: upload.path,
            });
        } else if (existingFiles.has(artifactPathKey(upload.path))) {
            plan.replacements.push(upload);
        } else {
            plan.additions.push(upload);
        }
    }
    return plan;
}

/**
 * Moves replacements whose bytes match the current revision (by SHA-256) out
 * of the question: re-uploading them would only add an identical revision.
 * `digests` holds each replacement's local hash; `current` the drive's, by
 * path key.
 */
export function skipUnchangedReplacements<F>(
    plan: UploadPlan<F>,
    digests: ReadonlyMap<string, string>,
    current: ReadonlyMap<string, string>
): UploadPlan<F> {
    const same = (upload: PlannedUpload<F>) => {
        const digest = digests.get(upload.path);
        return digest !== undefined && digest === current.get(artifactPathKey(upload.path));
    };
    return {
        ...plan,
        replacements: plan.replacements.filter((upload) => !same(upload)),
        unchanged: [...plan.unchanged, ...plan.replacements.filter(same)],
    };
}

const noiseNames = new Set(['.ds_store', 'thumbs.db', 'desktop.ini', 'icon\r']);
const noiseFolders = new Set(['__macosx', '.spotlight-v100', '.trashes', '.fseventsd']);

/** Files an operating system leaves behind that nobody means to share. */
export function isNoisePath(relativePath: string): boolean {
    const segments = relativePath.split('/');
    const name = (segments.at(-1) ?? '').toLowerCase();
    return (
        noiseNames.has(name) ||
        name.startsWith('._') ||
        segments.slice(0, -1).some((segment) => noiseFolders.has(segment.toLowerCase()))
    );
}

function conflict(
    path: string,
    sets: {
        acceptedKeys: ReadonlySet<string>;
        existingFiles: ReadonlySet<string>;
        existingFolders: ReadonlySet<string>;
    }
): string | null {
    const key = artifactPathKey(path);
    if (sets.acceptedKeys.has(key)) {
        return 'Another file in this upload has the same name.';
    }
    if (sets.existingFolders.has(key)) {
        return 'A folder with this name already exists.';
    }
    const fileAbove = artifactPathAncestors(path).find((ancestor) =>
        sets.existingFiles.has(artifactPathKey(ancestor))
    );
    return fileAbove ? `"${fileAbove}" is a file, not a folder.` : null;
}
