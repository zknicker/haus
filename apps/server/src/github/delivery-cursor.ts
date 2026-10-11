import { eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { githubDeliveryCursorTable } from '../postgres/schema.ts';

/** A first sweep looks this far back, so a fresh stack picks up what just happened. */
const initialLookbackMs = 10 * 60 * 1000;

export type GithubDeliveryCursor = typeof githubDeliveryCursorTable.$inferSelect;

/** The App's recovery cursor, created on first use with a watermark ten minutes back. */
export async function readGithubDeliveryCursor(
    db: HausDatabase,
    input: { appId: number; now: Date }
): Promise<GithubDeliveryCursor> {
    await db
        .insert(githubDeliveryCursorTable)
        .values({
            appId: input.appId,
            watermark: new Date(input.now.getTime() - initialLookbackMs),
        })
        .onConflictDoNothing({ target: githubDeliveryCursorTable.appId });
    const [cursor] = await db
        .select()
        .from(githubDeliveryCursorTable)
        .where(eq(githubDeliveryCursorTable.appId, input.appId))
        .limit(1);
    if (!cursor) {
        throw new Error(`The GitHub delivery cursor for App ${input.appId} is missing.`);
    }
    return cursor;
}

/** Records the span of deliveries GitHub no longer retains and Haus never saw. */
export async function recordGithubDeliveryGap(
    db: HausDatabase,
    input: { appId: number; from: Date; to: Date }
): Promise<void> {
    await db
        .update(githubDeliveryCursorTable)
        .set({ gapFrom: input.from, gapTo: input.to })
        .where(eq(githubDeliveryCursorTable.appId, input.appId));
}

/** A completed sweep moves the watermark to the moment it started. */
export async function advanceGithubDeliveryCursor(
    db: HausDatabase,
    input: { appId: number; sweptAt: Date; watermark: Date }
): Promise<void> {
    await db
        .update(githubDeliveryCursorTable)
        .set({ lastSweptAt: input.sweptAt, watermark: input.watermark })
        .where(eq(githubDeliveryCursorTable.appId, input.appId));
}
