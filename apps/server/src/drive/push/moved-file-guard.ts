import { eq } from 'drizzle-orm';
import type { ArtifactActor } from '../../artifacts/access.ts';
import type { HausDatabase } from '../../postgres/connection.ts';
import { computersTable } from '../../postgres/schema.ts';

const lastComputerWithoutGuard = [26, 0, 2] as const;

export async function pusherPlacesMovedFiles(db: HausDatabase, actor: ArtifactActor) {
    const computerId = actor.kind === 'agent' ? actor.runner.computerId : null;
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
