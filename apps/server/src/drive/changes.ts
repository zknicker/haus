import { type DriveAreaId, artifactPathKey } from '@haus/api';
import { sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { driveAreaCountersTable, driveChangesTable } from '../postgres/schema.ts';

export type DriveChangeEntry =
    | { change: 'put'; area: DriveAreaId; path: string; artifactId: string; revisionId: string }
    | { change: 'delete'; area: DriveAreaId; path: string; artifactId: string };

const insertChunk = 1000;

export async function recordDriveChanges(
    tx: HausDatabase,
    serverId: string,
    entries: readonly DriveChangeEntry[]
) {
    for (const [area, changes] of byArea(entries)) {
        const counter = await bumpCounter(tx, serverId, area, changes.length);
        const first = counter - changes.length + 1;
        const rows = new Map(
            changes.map((entry, index) => {
                const row = {
                    areaId: area,
                    artifactId: entry.artifactId,
                    change: entry.change,
                    path: entry.path,
                    pathKey: artifactPathKey(entry.path),
                    revisionId: entry.change === 'put' ? entry.revisionId : null,
                    sequence: first + index,
                    serverId,
                };
                return [row.pathKey, row] as const;
            })
        );
        const values = [...rows.values()];
        for (let start = 0; start < values.length; start += insertChunk) {
            await tx
                .insert(driveChangesTable)
                .values(values.slice(start, start + insertChunk))
                .onConflictDoUpdate({
                    set: {
                        artifactId: sql.raw('excluded.artifact_id'),
                        change: sql.raw('excluded.change'),
                        path: sql.raw('excluded.path'),
                        revisionId: sql.raw('excluded.revision_id'),
                        sequence: sql.raw('excluded.sequence'),
                    },
                    target: [
                        driveChangesTable.serverId,
                        driveChangesTable.areaId,
                        driveChangesTable.pathKey,
                    ],
                });
        }
    }
}

function byArea(entries: readonly DriveChangeEntry[]) {
    const groups = new Map<DriveAreaId, DriveChangeEntry[]>();
    for (const entry of entries) {
        groups.set(entry.area, [...(groups.get(entry.area) ?? []), entry]);
    }
    return groups;
}

async function bumpCounter(tx: HausDatabase, serverId: string, area: DriveAreaId, count: number) {
    const [row] = await tx
        .insert(driveAreaCountersTable)
        .values({ areaId: area, counter: count, serverId })
        .onConflictDoUpdate({
            set: { counter: sql`${driveAreaCountersTable.counter} + ${count}` },
            target: [driveAreaCountersTable.serverId, driveAreaCountersTable.areaId],
        })
        .returning({ counter: driveAreaCountersTable.counter });
    if (!row) {
        throw new Error('Drive area counter upsert returned no row.');
    }
    return row.counter;
}
