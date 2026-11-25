import { type DriveAreaId, artifactPathKey } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { insideFolder } from '../artifacts/path.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactsTable as artifacts } from '../postgres/schema.ts';
import { type DriveChangeEntry, recordDriveChanges } from './changes.ts';

export async function renameProjectFolder(
    tx: HausDatabase,
    project: { fromKey: string; projectId: string; serverId: string; toKey: string }
) {
    return await moveAreaFolder(tx, {
        area: `project:${project.projectId}`,
        from: `projects/${project.fromKey}`,
        serverId: project.serverId,
        to: `projects/${project.toKey}`,
    });
}

export async function moveAreaFolder(
    tx: HausDatabase,
    move: { area: DriveAreaId; from: string; serverId: string; to: string }
) {
    const { area, from, to } = move;
    const tail = (column: typeof artifacts.path | typeof artifacts.pathKey) =>
        sql`substr(${column}, ${from.length + 1})`;
    const moved = await tx
        .update(artifacts)
        .set({
            path: sql`${to} || ${tail(artifacts.path)}`,
            pathKey: sql`${artifactPathKey(to)} || ${tail(artifacts.pathKey)}`,
        })
        .where(and(eq(artifacts.serverId, move.serverId), insideFolder(from)))
        .returning({
            deletedAt: artifacts.deletedAt,
            id: artifacts.id,
            path: artifacts.path,
            revisionId: artifacts.currentRevisionId,
        });
    const published = moved.flatMap((row) =>
        row.deletedAt === null && row.revisionId !== null
            ? [{ ...row, revisionId: row.revisionId }]
            : []
    );
    await recordDriveChanges(tx, move.serverId, [
        ...published.map(
            (row) =>
                ({
                    area,
                    artifactId: row.id,
                    change: 'delete',
                    path: `${from}${row.path.slice(to.length)}`,
                }) satisfies DriveChangeEntry
        ),
        ...published.map(
            (row) =>
                ({
                    area,
                    artifactId: row.id,
                    change: 'put',
                    path: row.path,
                    revisionId: row.revisionId,
                }) satisfies DriveChangeEntry
        ),
    ]);
    return moved.length;
}
