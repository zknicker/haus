import {
    type ArtifactMoveInput,
    type ArtifactMoveResult,
    artifactPathIsInside,
    artifactPathKey,
} from '@haus/api';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactsTable as artifacts, serversTable } from '../postgres/schema.ts';
import { type ArtifactAccess, type ArtifactActor, artifactAccess } from './access.ts';
import { revisionConflict } from './conflict.ts';
import { insideFolder, live, liveArtifactAtPath, placeArtifactPath } from './path.ts';
import { ArtifactError } from './storage.ts';

/**
 * Moves one file, or every file under a folder prefix, to a free destination in one
 * transaction. Only paths change: ids, revisions, object keys, and links stay put.
 */
export async function moveArtifacts(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    input: Omit<ArtifactMoveInput, 'serverId'>
): Promise<ArtifactMoveResult> {
    const access = await artifactAccess(db, actor);
    return await db.transaction(async (tx) => {
        const [server] = await tx
            .select({ id: serversTable.id })
            .from(serversTable)
            .where(and(eq(serversTable.id, access.serverId), isNull(serversTable.deletedAt)))
            .for('update');
        if (!server) {
            throw new ArtifactError('Server was deleted.', 404, 'NOT_FOUND');
        }
        const file = await liveArtifactAtPath(tx, access.serverId, input.from);
        return file
            ? await moveFile(tx, access, origin, file, input)
            : await moveFolder(tx, access, input);
    });
}

async function moveFile(
    tx: HausDatabase,
    access: ArtifactAccess,
    origin: string,
    file: typeof artifacts.$inferSelect,
    input: Omit<ArtifactMoveInput, 'serverId'>
): Promise<ArtifactMoveResult> {
    if (input.base_revision_id && input.base_revision_id !== file.currentRevisionId) {
        throw await revisionConflict(tx, access, origin, {
            artifactId: file.id,
            baseRevisionId: input.base_revision_id,
            path: file.path,
        });
    }
    await requireFreeDestination(tx, access.serverId, input, [file.id]);
    const to = await placeArtifactPath(tx, access.serverId, input.to, [file.id]);
    await tx
        .update(artifacts)
        .set({ path: to, pathKey: artifactPathKey(to) })
        .where(eq(artifacts.id, file.id));
    return { from: file.path, kind: 'file', moved_count: 1, to };
}

async function moveFolder(
    tx: HausDatabase,
    access: ArtifactAccess,
    input: Omit<ArtifactMoveInput, 'serverId'>
): Promise<ArtifactMoveResult> {
    const rows = await tx
        .select({ id: artifacts.id, path: artifacts.path })
        .from(artifacts)
        .where(and(live(access.serverId), insideFolder(input.from)));
    const [first] = rows;
    if (!first) {
        throw new ArtifactError(`Nothing lives at \`${input.from}\`.`, 404, 'NOT_FOUND');
    }
    if (input.base_revision_id) {
        throw new ArtifactError(
            'base_revision_id guards single-file moves; a folder move takes none.',
            400,
            'INVALID_ARG'
        );
    }
    if (artifactPathIsInside(input.to, input.from)) {
        throw new ArtifactError(
            `\`${input.from}\` cannot move inside itself.`,
            409,
            'PATH_CONFLICT'
        );
    }
    const moving = rows.map((row) => row.id);
    await requireFreeDestination(tx, access.serverId, input, moving);
    const to = await placeArtifactPath(tx, access.serverId, input.to, moving);
    const depth = input.from.split('/').length;
    const from = first.path.split('/').slice(0, depth).join('/');
    // Each file keeps the segments below the moved folder; only the folder prefix changes.
    const rest = (column: typeof artifacts.path | typeof artifacts.pathKey) =>
        sql`array_to_string((string_to_array(${column}, '/'))[${sql.raw(String(depth + 1))}:], '/')`;
    await tx
        .update(artifacts)
        .set({
            path: sql`${to} || '/' || ${rest(artifacts.path)}`,
            pathKey: sql`${artifactPathKey(to)} || '/' || ${rest(artifacts.pathKey)}`,
        })
        .where(and(live(access.serverId), insideFolder(input.from)));
    return { from, kind: 'folder', moved_count: rows.length, to };
}

/** The destination may hold neither another file nor a folder of files that stay behind. */
async function requireFreeDestination(
    tx: HausDatabase,
    serverId: string,
    input: Pick<ArtifactMoveInput, 'to'>,
    moving: string[]
) {
    const others = and(live(serverId), notInArray(artifacts.id, moving));
    const [taken] = await tx
        .select({ path: artifacts.path })
        .from(artifacts)
        .where(and(others, eq(artifacts.pathKey, artifactPathKey(input.to))))
        .limit(1);
    const [occupied] = taken
        ? [taken]
        : await tx
              .select({ path: artifacts.path })
              .from(artifacts)
              .where(and(others, insideFolder(input.to)))
              .limit(1);
    if (occupied) {
        throw new ArtifactError(
            `\`${input.to}\` is taken (\`${occupied.path}\` lives there).`,
            409,
            'PATH_TAKEN'
        );
    }
}
