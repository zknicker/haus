import {
    type ArtifactZipInput,
    artifactPathBasename,
    artifactPathIsInside,
    artifactPathKey,
    artifactZipMaxBytes,
    artifactZipMaxFiles,
} from '@haus/api';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import type { ArtifactAccess } from './access.ts';
import { insideFolder, live } from './path.ts';
import { ArtifactError } from './storage.ts';

/** One archive member: the current revision's object, named relative to the selection root. */
export interface ZipEntry {
    modifiedAt: Date;
    name: string;
    objectKey: string;
    size: number;
}

export interface ZipPlan {
    entries: ZipEntry[];
    filename: string;
    totalBytes: number;
}

/**
 * Resolves a zip selection to the current revision of every file it names: a file path is that
 * file, a folder path every live file under it. Entries are named by their path relative to
 * `root`, sorted by path, each file once however many selected items contain it. Fails when a
 * path leaves `root`, when nothing is selected, or past the zip caps.
 */
export async function planArtifactZip(
    db: HausDatabase,
    access: ArtifactAccess,
    input: Pick<ArtifactZipInput, 'paths' | 'root'>
): Promise<ZipPlan> {
    for (const path of input.paths) {
        if (!artifactPathIsInside(path, input.root)) {
            throw new ArtifactError(
                `\`${path}\` is not inside \`${input.root}\`.`,
                400,
                'INVALID_ARG'
            );
        }
    }
    const keys = input.paths.map(artifactPathKey);
    const rows = await db
        .select({
            byteSize: revisions.byteSize,
            createdAt: revisions.createdAt,
            objectKey: revisions.objectKey,
            path: artifacts.path,
        })
        .from(artifacts)
        .innerJoin(
            revisions,
            and(
                eq(revisions.serverId, artifacts.serverId),
                eq(revisions.id, artifacts.currentRevisionId),
                eq(revisions.state, 'ready')
            )
        )
        .where(
            and(
                live(access.serverId),
                or(inArray(artifacts.pathKey, keys), ...input.paths.map(insideFolder))
            )
        )
        .orderBy(asc(artifacts.pathKey));
    if (rows.length === 0) {
        throw new ArtifactError('Nothing selected is in Files anymore.', 404, 'NOT_FOUND');
    }
    if (rows.length > artifactZipMaxFiles) {
        throw new ArtifactError(
            `A zip holds at most ${artifactZipMaxFiles.toLocaleString('en-US')} files; this selection has ${rows.length.toLocaleString('en-US')}.`,
            413,
            'SIZE_LIMIT'
        );
    }
    const totalBytes = rows.reduce((sum, row) => sum + row.byteSize, 0);
    if (totalBytes > artifactZipMaxBytes) {
        throw new ArtifactError(
            `A zip holds at most ${formatGigabytes(artifactZipMaxBytes)}; this selection is ${formatGigabytes(totalBytes)}. Download fewer files at once.`,
            413,
            'SIZE_LIMIT'
        );
    }
    const prefix = input.root ? input.root.length + 1 : 0;
    return {
        entries: rows.map((row) => ({
            modifiedAt: row.createdAt,
            name: row.path.slice(prefix),
            objectKey: row.objectKey,
            size: row.byteSize,
        })),
        filename: zipFilename(input),
        totalBytes,
    };
}

/** A lone folder names its archive; any other selection takes the root folder's name. */
function zipFilename(input: Pick<ArtifactZipInput, 'paths' | 'root'>): string {
    const [only] = input.paths;
    const name =
        input.paths.length === 1 && only
            ? artifactPathBasename(only)
            : artifactPathBasename(input.root);
    return `${(name || 'Files').replace(/\.zip$/iu, '')}.zip`;
}

function formatGigabytes(bytes: number) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}
