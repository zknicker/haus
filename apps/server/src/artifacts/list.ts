import type {
    ArtifactFolderEntry,
    ArtifactListFilters,
    ArtifactListResult,
    ArtifactListSummary,
    ArtifactRecord,
} from '@haus/api';
import { type AnyColumn, and, asc, desc, eq, gt, ilike, not, or, type SQL, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { insideFolder, live } from './path.ts';
import { artifactCreatorFilter, artifactRecord } from './read.ts';

/** A drive page of App records; Agent routes narrow each to its metadata. */
export type ArtifactDrivePage = Omit<ArtifactListResult, 'artifacts'> & {
    artifacts: ArtifactRecord[];
};

/**
 * Lists one drive folder: its immediate child folders (first page only, newest first) and its own
 * files, or with `recursive` every file under it, plus, for a recursive search, the folders whose
 * name matches. Filters apply to files; folder counts and the summary totals follow them.
 */
export async function listArtifactDrive(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    filters: ArtifactListFilters
): Promise<ArtifactDrivePage> {
    const access = await artifactAccess(db, actor);
    const depth = filters.prefix === '' ? 0 : filters.prefix.split('/').length;
    const scope = and(
        live(access.serverId),
        eq(revisions.state, 'ready'),
        filters.prefix === '' ? undefined : insideFolder(filters.prefix),
        fileFilters(filters)
    );
    const firstPage = filters.offset === 0;
    const searching = filters.recursive && filters.query !== '';
    const [rows, folders, summary] = await Promise.all([
        filePage(db, scope, depth, filters),
        firstPage && !filters.recursive
            ? childFolders(db, scope, depth)
            : firstPage && searching
              ? matchingFolders(db, scope, depth, filters.query)
              : [],
        listSummary(db, scope, depth),
    ]);
    const page = rows.slice(0, filters.limit);
    return {
        artifacts: page.map((row) => artifactRecord(row, origin, access.slug)),
        folders,
        next_offset: rows.length > filters.limit ? filters.offset + filters.limit : null,
        summary,
    };
}

const segmentCount = sql<number>`array_length(string_to_array(${artifacts.path}, '/'), 1)`;

function filePage(
    db: HausDatabase,
    scope: SQL | undefined,
    depth: number,
    filters: ArtifactListFilters
) {
    return db
        .select({ artifact: artifacts, revision: revisions })
        .from(artifacts)
        .innerJoin(revisions, currentRevision())
        .where(and(scope, filters.recursive ? undefined : eq(segmentCount, depth + 1)))
        .orderBy(...fileOrder(filters))
        .limit(filters.limit + 1)
        .offset(filters.offset);
}

/** The file name, ordered naturally (`2` before `10`) by migration 0093's ICU collation. */
const naturalName = sql`regexp_replace(${artifacts.path}, '^.*/', '') collate "artifact_natural"`;

const naturalPath = sql`${artifacts.path} collate "artifact_natural"`;

/** Every order ends on the artifact id, so offset pages never repeat or skip a file. */
function fileOrder(filters: Pick<ArtifactListFilters, 'direction' | 'order'>): SQL[] {
    if (filters.order === 'path') {
        return [asc(artifacts.pathKey), asc(artifacts.id)];
    }
    const descending =
        (filters.direction ?? (filters.order === 'updated' ? 'desc' : 'asc')) === 'desc';
    const by = (value: SQL | AnyColumn) => (descending ? desc(value) : asc(value));
    switch (filters.order) {
        case 'updated':
            return [by(revisions.createdAt), by(artifacts.id)];
        case 'name':
            // Search hits can share a name; their folders then decide, naturally too.
            return [by(naturalName), by(naturalPath), by(artifacts.id)];
        case 'size':
            return [by(revisions.byteSize), asc(naturalName), asc(artifacts.id)];
        case 'kind':
            return [by(sql`lower(${revisions.contentType})`), asc(naturalName), asc(artifacts.id)];
    }
}

async function childFolders(
    db: HausDatabase,
    scope: SQL | undefined,
    depth: number
): Promise<ArtifactFolderEntry[]> {
    const segment = depth + 1;
    // Inlined, not bound: GROUP BY and ORDER BY must see the identical expression.
    const index = sql.raw(String(segment));
    const folderKey = sql<string>`split_part(${artifacts.pathKey}, '/', ${index})`;
    const updatedAt = sql<Date>`max(${revisions.createdAt})`;
    const rows = await db
        .select({
            fileCount: sql<number>`count(*)`.mapWith(Number),
            path: sql<string>`min(array_to_string((string_to_array(${artifacts.path}, '/'))[1:${index}], '/'))`,
            updatedAt: updatedAt.mapWith(revisions.createdAt),
        })
        .from(artifacts)
        .innerJoin(revisions, currentRevision())
        .where(and(scope, gt(segmentCount, segment)))
        .groupBy(folderKey)
        // Newest first, so a fresh upload leads; the path key breaks ties.
        .orderBy(desc(updatedAt), asc(folderKey));
    return rows.map((row) => ({
        file_count: row.fileCount,
        name: row.path.slice(row.path.lastIndexOf('/') + 1),
        path: row.path,
        updated_at: row.updatedAt.toISOString(),
    }));
}

/**
 * A search's folders: every folder under the listed one whose own name matches, with the count and
 * newest revision of the matching files under it, newest first. Capped, like a first page.
 */
async function matchingFolders(
    db: HausDatabase,
    scope: SQL | undefined,
    depth: number,
    query: string
): Promise<ArtifactFolderEntry[]> {
    const level = sql`level.n`;
    const folderKey = sql<string>`array_to_string((string_to_array(${artifacts.pathKey}, '/'))[1:${level}], '/')`;
    const updatedAt = sql<Date>`max(${revisions.createdAt})`;
    const rows = await db
        .select({
            fileCount: sql<number>`count(*)`.mapWith(Number),
            path: sql<string>`min(array_to_string((string_to_array(${artifacts.path}, '/'))[1:${level}], '/'))`,
            updatedAt: updatedAt.mapWith(revisions.createdAt),
        })
        .from(artifacts)
        .innerJoin(revisions, currentRevision())
        .innerJoin(
            sql`lateral generate_series(${depth + 1}::int, ${segmentCount} - 1) as level(n)`,
            sql`true`
        )
        .where(
            and(scope, ilike(sql`split_part(${artifacts.path}, '/', ${level})`, likePattern(query)))
        )
        .groupBy(folderKey)
        .orderBy(desc(updatedAt), asc(folderKey))
        .limit(searchFolderLimit);
    return rows.map((row) => ({
        file_count: row.fileCount,
        name: row.path.slice(row.path.lastIndexOf('/') + 1),
        path: row.path,
        updated_at: row.updatedAt.toISOString(),
    }));
}

const searchFolderLimit = 50;

function likePattern(query: string) {
    return `%${query.replace(/[\\%_]/gu, '\\$&')}%`;
}

/** Exact totals for the listed folder, one aggregate pass, the same with or without `recursive`. */
async function listSummary(
    db: HausDatabase,
    scope: SQL | undefined,
    depth: number
): Promise<ArtifactListSummary> {
    const index = sql.raw(String(depth + 1));
    const nested = sql`${segmentCount} > ${index}`;
    const folderKey = sql`split_part(${artifacts.pathKey}, '/', ${index})`;
    const [row] = await db
        .select({
            all: sql<number>`count(*)`.mapWith(Number),
            folders: sql<number>`count(distinct ${folderKey}) filter (where ${nested})`.mapWith(
                Number
            ),
            nested: sql<number>`count(*) filter (where ${nested})`.mapWith(Number),
        })
        .from(artifacts)
        .innerJoin(revisions, currentRevision())
        .where(scope);
    if (!row) {
        throw new Error('Artifact list summary returned no row.');
    }
    return { folders: row.folders, files_in_folders: row.nested, files: row.all - row.nested };
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
    const pattern = likePattern(filters.query);
    return and(
        kind,
        artifactCreatorFilter(filters.creator),
        filters.query
            ? or(ilike(revisions.title, pattern), ilike(artifacts.path, pattern))
            : undefined
    );
}
