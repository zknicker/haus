import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    type ArtifactMetadata,
    artifactListResultSchema,
    artifactMetadataSchema,
    artifactPathBasename,
    artifactPathIsInside,
    artifactPublishResultSchema,
    parseArtifactPath,
} from '@haus/api';
import * as z from 'zod';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import {
    displayPath,
    localFileSha,
    localTargetUnder,
    sha256File,
    THEIRS_SUFFIX,
} from './artifact-local-files.ts';
import {
    type ArtifactManifest,
    openArtifactManifest,
    recordArtifactManifestEntry,
    writeArtifactManifest,
} from './artifact-manifest.ts';

const base = '/api/agent/artifacts';
const viewSchema = z.object({ artifact: artifactMetadataSchema, path: z.string().min(1) });

type FileResult = 'updated' | 'unchanged' | 'kept' | 'merge';
interface PullReport {
    kept_local_edits: string[];
    merge: { local: string; path: string; revision_id: string; theirs: string }[];
    orphaned: string[];
    removed: string[];
    unchanged: number;
    updated: string[];
}

/** `haus artifact pull <drive-path> [<local>]`: one file, or every file under a folder. */
export async function runArtifactPull(
    args: ParsedArgs,
    client: AgentApiRequester
): Promise<number> {
    const [source, local] = args.positionals;
    const drivePath = requireDrivePath(source);
    const file = await fileAt(client, drivePath);
    const report: PullReport = {
        kept_local_edits: [],
        merge: [],
        orphaned: [],
        removed: [],
        unchanged: 0,
        updated: [],
    };
    let manifest: ArtifactManifest;
    if (file) {
        const requested = await localFileTarget(file, local);
        await fs.mkdir(path.dirname(requested), { recursive: true });
        // Real paths throughout, so manifest keys and targets agree under symlinked temp dirs.
        const folder = await fs.realpath(path.dirname(requested));
        const target = path.join(folder, path.basename(requested));
        manifest = await openArtifactManifest(folder, folder, null);
        tally(report, target, file, await syncFile(client, manifest, target, file));
    } else {
        const artifacts = await listFolder(client, drivePath);
        const requested = path.resolve(local ?? artifactPathBasename(drivePath));
        await fs.mkdir(requested, { recursive: true });
        const root = await fs.realpath(requested);
        manifest = await openArtifactManifest(root, root, drivePath);
        const live = new Set<string>();
        for (const artifact of artifacts) {
            live.add(artifact.artifact_id);
            const target = await localTargetUnder(root, artifact.path.slice(drivePath.length + 1));
            tally(report, target, artifact, await syncFile(client, manifest, target, artifact));
        }
        await dropVanished(manifest, root, drivePath, live, report);
    }
    process.stdout.write(
        `${JSON.stringify({ source: drivePath, kind: file ? 'file' : 'folder', manifest: displayPath(manifest.file), ...report }, null, 2)}\n`
    );
    if (report.merge.length > 0) {
        process.stderr.write(
            `Kept your local edits to ${report.merge.length} file(s). The current drive version sits beside each as ${THEIRS_SUFFIX}: merge it into your file, delete the ${THEIRS_SUFFIX} file, then push.\n`
        );
    }
    return 0;
}

/** Reads the current file at a path, or null when the path is a folder or empty. */
async function fileAt(client: AgentApiRequester, drivePath: string) {
    try {
        const result = await client.request(`${base}/by-path`, artifactPublishResultSchema, {
            query: { path: drivePath },
        });
        return result.artifact;
    } catch (error) {
        if (error instanceof AgentCliError && error.code === 'NOT_FOUND') {
            return null;
        }
        throw error;
    }
}

async function listFolder(client: AgentApiRequester, prefix: string): Promise<ArtifactMetadata[]> {
    const artifacts: ArtifactMetadata[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
        const page: z.infer<typeof artifactListResultSchema> = await client.request(
            base,
            artifactListResultSchema,
            { query: { prefix, recursive: 'true', order: 'path', limit: 200, offset } }
        );
        artifacts.push(...page.artifacts);
        offset = page.next_offset;
    }
    if (artifacts.length === 0) {
        throw new AgentCliError('NOT_FOUND', `Nothing lives at ${prefix} on the drive.`, {
            nextAction: 'Run haus artifact list to browse folders.',
        });
    }
    return artifacts.filter((artifact) => artifactPathIsInside(artifact.path, prefix));
}

/**
 * Brings one local file up to the drive's revision without losing local edits. A file whose
 * bytes differ from what was last pulled keeps them; the incoming revision lands beside it.
 */
async function syncFile(
    client: AgentApiRequester,
    manifest: ArtifactManifest,
    target: string,
    artifact: ArtifactMetadata
): Promise<FileResult> {
    const key = path.relative(manifest.root, target).split(path.sep).join('/');
    const entry = manifest.data.files[key];
    const localSha = await localFileSha(target);
    const record = () =>
        recordArtifactManifestEntry(manifest, target, {
            artifact_id: artifact.artifact_id,
            path: artifact.path,
            revision_id: artifact.revision_id,
            sha256: artifact.sha256,
        });
    if (localSha === artifact.sha256) {
        await record();
        return 'unchanged';
    }
    if (localSha === null || (entry && localSha === entry.sha256)) {
        await download(client, artifact, target);
        await record();
        return 'updated';
    }
    if (entry && entry.sha256 === artifact.sha256) {
        await record();
        return 'kept';
    }
    await download(client, artifact, `${target}${THEIRS_SUFFIX}`);
    await record();
    return 'merge';
}

/** Copies the revision from the Computer's verified shared cache into the workspace. */
async function download(client: AgentApiRequester, artifact: ArtifactMetadata, target: string) {
    const view = await client.request(
        `${base}/${encodeURIComponent(artifact.artifact_id)}/view`,
        viewSchema,
        { query: { revision_id: artifact.revision_id }, timeoutMs: 300_000 }
    );
    const temp = `${target}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    try {
        await fs.copyFile(view.path, temp, fs.constants.COPYFILE_EXCL);
        await fs.chmod(temp, 0o644);
        await fs.rename(temp, target);
    } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
    }
}

/** Files this folder pull recorded before that no longer live on the drive. */
async function dropVanished(
    manifest: ArtifactManifest,
    root: string,
    prefix: string,
    live: Set<string>,
    report: PullReport
) {
    let changed = false;
    for (const [key, entry] of Object.entries(manifest.data.files)) {
        const local = path.join(manifest.root, key);
        const underRoot = !path.relative(root, local).startsWith('..');
        if (
            live.has(entry.artifact_id) ||
            !underRoot ||
            !artifactPathIsInside(entry.path, prefix)
        ) {
            continue;
        }
        delete manifest.data.files[key];
        changed = true;
        const stat = await fs.lstat(local).catch(() => null);
        if (stat?.isFile() && (await sha256File(local)) === entry.sha256) {
            await fs.rm(local);
            report.removed.push(displayPath(local));
        } else if (stat) {
            report.orphaned.push(displayPath(local));
        }
    }
    if (changed) {
        await writeArtifactManifest(manifest);
    }
}

function tally(report: PullReport, target: string, artifact: ArtifactMetadata, result: FileResult) {
    if (result === 'merge') {
        report.merge.push({
            local: displayPath(target),
            path: artifact.path,
            revision_id: artifact.revision_id,
            theirs: displayPath(`${target}${THEIRS_SUFFIX}`),
        });
    } else if (result === 'unchanged') {
        report.unchanged += 1;
    } else if (result === 'updated') {
        report.updated.push(displayPath(target));
    } else if (result === 'kept') {
        report.kept_local_edits.push(displayPath(target));
    }
}

/** No local path: the file name in the working directory. A folder: the file name inside it. */
async function localFileTarget(artifact: ArtifactMetadata, local: string | undefined) {
    if (!local) {
        return path.resolve(artifact.filename);
    }
    const isFolder = local.endsWith('/') || (await fs.stat(local).catch(() => null))?.isDirectory();
    return isFolder ? path.resolve(local, artifact.filename) : path.resolve(local);
}

export function requireDrivePath(raw: string | undefined): string {
    const parsed = parseArtifactPath((raw ?? '').replace(/\/+$/u, ''));
    if (!parsed.ok) {
        throw new AgentCliError('INVALID_PATH', `Drive path ${raw ?? ''}: ${parsed.message}`);
    }
    return parsed.path;
}
