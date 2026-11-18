import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArtifactPath } from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import { isIgnoredName, joinDrivePath, walkLocalFiles } from './artifact-local-files.ts';
import { type ArtifactManifest, manifestKey, openArtifactManifest } from './artifact-manifest.ts';

export interface PushItem {
    local: string;
    manifest: ArtifactManifest;
    path: string;
}
export interface PushPlan {
    invalid: { local: string; message: string }[];
    items: PushItem[];
    /** Symlinks and other non-regular entries the walk left alone. */
    skipped: string[];
}

/**
 * Decides where each local file goes. An explicit `<drive-path>` wins (a folder for a directory
 * push, a file path for a file push, or a folder when it ends in `/`). Otherwise a file keeps the
 * path its manifest recorded; a new file lands under its manifest's folder, or under the pushed
 * directory's name, or at the drive root under its own name.
 */
export async function planArtifactPush(
    local: string,
    target: string | undefined
): Promise<PushPlan> {
    const stat = await fs.lstat(path.resolve(local)).catch(() => null);
    if (!(stat && (stat.isFile() || stat.isDirectory()))) {
        throw new AgentCliError('INVALID_ARG', `${local} is not a regular file or folder.`);
    }
    // Real paths, so manifest keys match the ones pull recorded.
    const source = await fs.realpath(local);
    const manifests = new Map<string, ArtifactManifest>();
    const manifestFor = async (directory: string, root: string, folder: string | null) => {
        const opened = await openArtifactManifest(directory, root, folder);
        const cached = manifests.get(opened.file);
        if (cached) {
            return cached;
        }
        manifests.set(opened.file, opened);
        return opened;
    };
    const plan: PushPlan = { invalid: [], items: [], skipped: [] };
    const add = (file: string, manifest: ArtifactManifest, drivePath: string) => {
        const parsed = parseArtifactPath(drivePath);
        if (parsed.ok) {
            plan.items.push({ local: file, manifest, path: parsed.path });
        } else {
            plan.invalid.push({ local: file, message: `${drivePath}: ${parsed.message}` });
        }
    };
    if (stat.isFile()) {
        if (isIgnoredName(path.basename(source))) {
            throw new AgentCliError(
                'INVALID_ARG',
                `${local} is bookkeeping or noise; push skips it.`
            );
        }
        const manifest = await manifestFor(path.dirname(source), path.dirname(source), null);
        add(source, manifest, fileDrivePath(source, manifest, target));
        return plan;
    }
    const folderTarget = target?.replace(/\/+$/u, '');
    const defaultFolder = folderTarget ?? path.basename(source);
    const walk = await walkLocalFiles(source);
    plan.skipped = walk.skipped;
    for (const file of walk.files) {
        const manifest = await manifestFor(path.dirname(file), source, defaultFolder);
        const relative = path.relative(source, file).split(path.sep).join('/');
        if (folderTarget !== undefined) {
            add(file, manifest, joinDrivePath(folderTarget, relative));
            continue;
        }
        const key = manifestKey(manifest, file);
        const recorded = manifest.data.files[key]?.path;
        const folder = manifest.data.folder;
        add(
            file,
            manifest,
            recorded ??
                (folder === null
                    ? joinDrivePath(defaultFolder, relative)
                    : joinDrivePath(folder, key))
        );
    }
    return plan;
}

function fileDrivePath(file: string, manifest: ArtifactManifest, target: string | undefined) {
    if (target !== undefined) {
        return target.endsWith('/')
            ? joinDrivePath(target.replace(/\/+$/u, ''), path.basename(file))
            : target;
    }
    const key = manifestKey(manifest, file);
    const folder = manifest.data.folder;
    return (
        manifest.data.files[key]?.path ??
        (folder === null ? path.basename(file) : joinDrivePath(folder, key))
    );
}
