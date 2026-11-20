import {
    type ArtifactMoveInput,
    type ArtifactMoveResult,
    type DriveAreaId,
    artifactPathIsInside,
    artifactPathKey,
    artifactPathMaxLength,
} from '@haus/api';
import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { writableDriveFolder, writableDrivePath } from '../drive/areas.ts';
import { type DriveChangeEntry, recordDriveChanges } from '../drive/changes.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactsTable as artifacts, serversTable } from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
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
    const moved = await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const file = await liveArtifactAtPath(tx, access.serverId, input.from);
        return file
            ? { artifactId: file.id, result: await moveFile(tx, access, origin, file, input) }
            : { artifactId: null, result: await moveFolder(tx, access, input) };
    });
    artifactUpdatedTopic.announce({ artifactId: moved.artifactId, serverId: access.serverId });
    return moved.result;
}

export async function moveFile(
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
    const source = await writableDrivePath(tx, access, file.path);
    const target = await writableDrivePath(tx, access, input.to);
    await requireFreeDestination(tx, access.serverId, target.path, [file.id]);
    const to = await placeArtifactPath(tx, access.serverId, target.path, [file.id]);
    await tx
        .update(artifacts)
        .set({ path: to, pathKey: artifactPathKey(to) })
        .where(eq(artifacts.id, file.id));
    await recordDriveChanges(
        tx,
        access.serverId,
        movedChanges([{ from: file.path, id: file.id, revisionId: file.currentRevisionId, to }], {
            from: source.area,
            to: target.area,
        })
    );
    return { from: file.path, kind: 'file', moved_count: 1, to };
}

export async function moveFolder(
    tx: HausDatabase,
    access: ArtifactAccess,
    input: Omit<ArtifactMoveInput, 'serverId'>
): Promise<ArtifactMoveResult> {
    const rows = await tx
        .select({ id: artifacts.id, path: artifacts.path, revisionId: artifacts.currentRevisionId })
        .from(artifacts)
        .where(and(live(access.serverId), insideFolder(input.from)))
        .orderBy(artifacts.pathKey);
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
    const source = await writableDriveFolder(tx, access, input.from);
    const target = await writableDriveFolder(tx, access, input.to);
    if (artifactPathIsInside(target.path, input.from)) {
        throw new ArtifactError(
            `\`${input.from}\` cannot move inside itself.`,
            409,
            'PATH_CONFLICT'
        );
    }
    const longest = Math.max(...rows.map((row) => row.path.length));
    if (longest - input.from.length + target.path.length > artifactPathMaxLength) {
        throw new ArtifactError(
            `Moving \`${input.from}\` to \`${target.path}\` would make a path longer than ${artifactPathMaxLength} characters.`,
            400,
            'INVALID_PATH'
        );
    }
    const moving = rows.map((row) => row.id);
    await requireFreeDestination(tx, access.serverId, target.path, moving);
    const to = await placeArtifactPath(tx, access.serverId, target.path, moving);
    const depth = input.from.split('/').length;
    const from = first.path.split('/').slice(0, depth).join('/');
    // Each file keeps the segments below the moved folder; only the folder prefix changes.
    const rest = (column: typeof artifacts.path | typeof artifacts.pathKey) =>
        sql`array_to_string((string_to_array(${column}, '/'))[${sql.raw(String(depth + 1))}:], '/')`;
    const landed = await tx
        .update(artifacts)
        .set({
            path: sql`${to} || '/' || ${rest(artifacts.path)}`,
            pathKey: sql`${artifactPathKey(to)} || '/' || ${rest(artifacts.pathKey)}`,
        })
        .where(and(live(access.serverId), insideFolder(input.from)))
        .returning({ id: artifacts.id, path: artifacts.path });
    const landedPaths = new Map(landed.map((row) => [row.id, row.path]));
    await recordDriveChanges(
        tx,
        access.serverId,
        movedChanges(
            rows.map((row) => ({
                from: row.path,
                id: row.id,
                revisionId: row.revisionId,
                to: landedPaths.get(row.id) ?? row.path,
            })),
            { from: source.area, to: target.area }
        )
    );
    return { from, kind: 'folder', moved_count: rows.length, to };
}

/** Each published file leaves a delete at its old path and a put at its new one. */
function movedChanges(
    files: readonly { from: string; id: string; revisionId: string | null; to: string }[],
    areas: { from: DriveAreaId; to: DriveAreaId }
) {
    const published = files.flatMap((file) =>
        file.revisionId ? [{ ...file, revisionId: file.revisionId }] : []
    );
    return [
        ...published.map((file): DriveChangeEntry => ({
            area: areas.from,
            artifactId: file.id,
            change: 'delete',
            path: file.from,
        })),
        ...published.map((file): DriveChangeEntry => ({
            area: areas.to,
            artifactId: file.id,
            change: 'put',
            path: file.to,
            revisionId: file.revisionId,
        })),
    ];
}

/** The Server row lock that serializes every artifact insert, move, and delete. */
export async function lockLiveServer(tx: HausDatabase, serverId: string) {
    const [server] = await tx
        .select({ id: serversTable.id })
        .from(serversTable)
        .where(and(eq(serversTable.id, serverId), isNull(serversTable.deletedAt)))
        .for('update');
    if (!server) {
        throw new ArtifactError('Server was deleted.', 404, 'NOT_FOUND');
    }
}

/** The destination may hold neither another file nor a folder of files that stay behind. */
async function requireFreeDestination(
    tx: HausDatabase,
    serverId: string,
    to: string,
    moving: string[]
) {
    const others = and(live(serverId), notInArray(artifacts.id, moving));
    const [taken] = await tx
        .select({ path: artifacts.path })
        .from(artifacts)
        .where(and(others, eq(artifacts.pathKey, artifactPathKey(to))))
        .limit(1);
    const [occupied] = taken
        ? [taken]
        : await tx
              .select({ path: artifacts.path })
              .from(artifacts)
              .where(and(others, insideFolder(to)))
              .limit(1);
    if (occupied) {
        throw new ArtifactError(
            `\`${to}\` is taken (\`${occupied.path}\` lives there).`,
            409,
            'PATH_TAKEN'
        );
    }
}
