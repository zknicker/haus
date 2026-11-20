import { eq, max, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';

// WARNING: number only under the Server row lock; landing order alone keeps the numbers gapless.
export async function takeNextNumber(tx: HausDatabase, artifactId: string) {
    const [row] = await tx
        .select({ highest: max(revisions.revisionNumber) })
        .from(revisions)
        .where(eq(revisions.artifactId, artifactId));
    return Math.max(row?.highest ?? 0, 0) + 1;
}

export async function takePlaceholderNumber(tx: HausDatabase, artifactId: string) {
    const [file] = await tx
        .update(artifacts)
        .set({ nextRevision: sql`${artifacts.nextRevision} + 1` })
        .where(eq(artifacts.id, artifactId))
        .returning({ next: artifacts.nextRevision });
    if (!file) {
        throw new Error(`Artifact ${artifactId} vanished under the Server lock.`);
    }
    return -(file.next - 1);
}
