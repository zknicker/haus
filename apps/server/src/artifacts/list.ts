import type { ArtifactFolderEntry, ArtifactListFilters, ArtifactListResult } from '@haus/api';
import { and, asc, desc, eq, gt, ilike, not, or, type SQL, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { insideFolder, live } from './path.ts';
import { artifactCreatorFilter, artifactMetadata } from './read.ts';

/**
 * Lists one drive folder: its immediate child folders (first page only) and its own files, or
 * with `recursive` every file under it. Filters apply to files, and folder counts follow them.
 */
export async function listArtifactDrive(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    filters: ArtifactListFilters
): Promise<ArtifactListResult> {
    const access = await artifactAccess(db, actor);
    const depth = filters.prefix === '' ? 0 : filters.prefix.split('/').length;
    const scope = and(
        live(access.serverId),
        eq(revisions.state, 'ready'),
        filters.prefix === '' ? undefined : insideFolder(filters.prefix),
        fileFilters(filters)
    );
    const rows = await db
        .select({ artifact: artifacts, revision: revisions })
        .from(artifacts)
        .innerJoin(revisions, currentRevision())
        .where(and(scope, filters.recursive ? undefined : eq(segmentCount, depth + 1)))
        .orderBy(
            ...(filters.order === 'path'
                ? [asc(artifacts.pathKey), asc(artifacts.id)]
                : [desc(revisions.createdAt), desc(artifacts.id)])
        )
        .limit(filters.limit + 1)
        .offset(filters.offset);
    const page = rows.slice(0, filters.limit);
    return {
        artifacts: page.map((row) => artifactMetadata(row, origin, access.slug)),
        folders:
            filters.recursive || filters.offset > 0 ? [] : await childFolders(db, scope, depth),
        next_offset: rows.length > filters.limit ? filters.offset + filters.limit : null,
    };
}

const segmentCount = sql<number>`array_length(string_to_array(${artifacts.path}, '/'), 1)`;

async function childFolders(
    db: HausDatabase,
    scope: SQL | undefined,
    depth: number
): Promise<ArtifactFolderEntry[]> {
    const segment = depth + 1;
    // Inlined, not bound: GROUP BY and ORDER BY must see the identical expression.
    const index = sql.raw(String(segment));
    const folderKey = sql<string>`split_part(${artifacts.pathKey}, '/', ${index})`;
    const rows = await db
        .select({
            fileCount: sql<number>`count(*)`.mapWith(Number),
            path: sql<string>`min(array_to_string((string_to_array(${artifacts.path}, '/'))[1:${index}], '/'))`,
            updatedAt: sql<Date>`max(${revisions.createdAt})`.mapWith(revisions.createdAt),
        })
        .from(artifacts)
        .innerJoin(revisions, currentRevision())
        .where(and(scope, gt(segmentCount, segment)))
        .groupBy(folderKey)
        .orderBy(asc(folderKey));
    return rows.map((row) => ({
        file_count: row.fileCount,
        name: row.path.slice(row.path.lastIndexOf('/') + 1),
        path: row.path,
        updated_at: row.updatedAt.toISOString(),
    }));
}

function currentRevision() {
    return and(
        eq(revisions.serverId, artifacts.serverId),
        eq(revisions.artifactId, artifacts.id),
        eq(revisions.id, artifacts.currentRevisionId)
    );
}

function fileFilters(filters: ArtifactListFilters) {
    const image = ilike(revisions.contentType, 'image/%');
    const media = or(
        ilike(revisions.contentType, 'audio/%'),
        ilike(revisions.contentType, 'video/%')
    );
    const documents = or(
        ilike(revisions.contentType, 'text/%'),
        eq(revisions.contentType, 'application/pdf'),
        ilike(revisions.contentType, '%officedocument%'),
        eq(revisions.contentType, 'application/json')
    );
    const kind = {
        all: undefined,
        documents,
        images: image,
        media,
        other: not(sql`(${image} or ${media} or ${documents})`),
    }[filters.kind];
    const pattern = `%${filters.query.replace(/[\\%_]/gu, '\\$&')}%`;
    return and(
        kind,
        artifactCreatorFilter(filters.creator),
        filters.query
            ? or(ilike(revisions.title, pattern), ilike(artifacts.path, pattern))
            : undefined
    );
}
