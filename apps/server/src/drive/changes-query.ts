import {
    type DriveAreaCounters,
    type DriveChange,
    type DriveChangesResult,
    driveChangesPageMax,
} from '@haus/api';
import { and, eq, gt, lte, or, sql } from 'drizzle-orm';
import { type ArtifactActor, artifactAccess } from '../artifacts/access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactRevisionsTable as revisions,
    driveAreaCountersTable,
    driveChangesTable as changes,
} from '../postgres/schema.ts';
import { serverDriveAreas } from './areas.ts';

export async function readDriveChanges(
    db: HausDatabase,
    actor: ArtifactActor,
    input: { since: DriveAreaCounters; until?: DriveAreaCounters }
) {
    const { serverId } = await artifactAccess(db, actor);
    const counters = await areaCounters(db, serverId);
    const areas = (await serverDriveAreas(db, serverId)).map((area) => ({
        ...area,
        counter: counters.get(area.area) ?? 0,
    }));
    const until = input.until ?? Object.fromEntries(areas.map((area) => [area.area, area.counter]));
    const windows = areas.flatMap(({ area }) => {
        const after = input.since[area] ?? 0;
        const upTo = until[area] ?? 0;
        return upTo > after
            ? [
                  and(
                      eq(changes.areaId, area),
                      gt(changes.sequence, after),
                      lte(changes.sequence, upTo)
                  ),
              ]
            : [];
    });
    if (windows.length === 0) {
        return { areas, changes: [], complete: true, until } satisfies DriveChangesResult;
    }
    const rows = await db
        .select({ change: changes, revision: revisions })
        .from(changes)
        .leftJoin(
            revisions,
            and(eq(revisions.serverId, changes.serverId), eq(revisions.id, changes.revisionId))
        )
        .where(and(eq(changes.serverId, serverId), or(...windows)))
        .orderBy(sql`${changes.areaId} collate "C"`, changes.sequence)
        .limit(driveChangesPageMax + 1);
    return {
        areas,
        changes: rows.slice(0, driveChangesPageMax).map(driveChange),
        complete: rows.length <= driveChangesPageMax,
        until,
    } satisfies DriveChangesResult;
}

async function areaCounters(db: HausDatabase, serverId: string) {
    const rows = await db
        .select({ area: driveAreaCountersTable.areaId, counter: driveAreaCountersTable.counter })
        .from(driveAreaCountersTable)
        .where(eq(driveAreaCountersTable.serverId, serverId));
    return new Map(rows.map((row) => [row.area, row.counter]));
}

function driveChange(row: {
    change: typeof changes.$inferSelect;
    revision: typeof revisions.$inferSelect | null;
}) {
    const { change, revision } = row;
    const base = {
        area: change.areaId,
        artifact_id: change.artifactId,
        path: change.path,
        sequence: change.sequence,
    };
    if (change.change === 'delete') {
        return {
            ...base,
            change: 'delete',
            content_type: null,
            revision_id: null,
            sha256: null,
            size_bytes: null,
        } satisfies DriveChange;
    }
    if (!(revision?.sha256 && change.revisionId)) {
        throw new Error(
            `Drive change ${change.areaId}#${change.sequence} names no ready revision.`
        );
    }
    return {
        ...base,
        change: 'put',
        content_type: revision.contentType,
        revision_id: change.revisionId,
        sha256: revision.sha256,
        size_bytes: revision.byteSize,
    } satisfies DriveChange;
}
