import { and, eq } from 'drizzle-orm';
import type { ArtifactActor } from '../../artifacts/access.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import { computersTable, workersTable } from '../../postgres/schema.ts';

const lastComputerWithoutGuard = [26, 0, 2] as const;

export async function pusherPlacesMovedFiles(db: HausDatabase, actor: ArtifactActor) {
    const computerId = await pushingComputerId(db, actor);
    if (!computerId) {
        return false;
    }
    const [computer] = await db
        .select({ productVersion: computersTable.productVersion })
        .from(computersTable)
        .where(eq(computersTable.id, computerId))
        .limit(1);
    return hasMovedFileGuard(computer?.productVersion ?? null);
}

export function hasMovedFileGuard(productVersion: string | null) {
    const match = productVersion ? /^(\d+)\.(\d+)\.(\d+)/u.exec(productVersion) : null;
    if (!match) {
        return false;
    }
    const parts = match.slice(1).map(Number);
    for (const [index, floor] of lastComputerWithoutGuard.entries()) {
        const part = parts[index] ?? 0;
        if (part !== floor) {
            return part > floor;
        }
    }
    return false;
}

async function pushingComputerId(db: HausDatabase, actor: ArtifactActor) {
    if (actor.kind === 'agent') {
        return actor.runner.computerId;
    }
    if (actor.kind === 'human') {
        return null;
    }
    const [worker] = await db
        .select({ computerId: workersTable.carrierComputerId })
        .from(workersTable)
        .where(
            and(
                eq(workersTable.serverId, actor.worker.serverId),
                eq(workersTable.id, actor.worker.workerId)
            )
        )
        .limit(1);
    return worker?.computerId ?? null;
}
