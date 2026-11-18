import { and, eq, exists, inArray, or, type SQL, sql } from 'drizzle-orm';
import {
    type CloudAgentWorkViewer,
    linkChatVisibleSql,
    linkParentChatsTable,
} from '../cloud-agents/cloud-agent-work-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatsTable,
    imageGenerationLinksTable,
    imageGenerationsTable,
} from '../postgres/schema.ts';

/** Who is asking to see an image generation: a member, or an Agent. */
export type ImageGenerationViewer = CloudAgentWorkViewer;

/**
 * The one "may this viewer see this generation?" predicate over
 * `imageGenerationsTable` (ADR 0044 pattern): some link lives in a Chat the
 * viewer can read. The requesting Agent always sees its own generation.
 */
export function imageGenerationVisibleSql(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    viewer: ImageGenerationViewer
): SQL {
    const linked = exists(
        db
            .select({ one: sql`1` })
            .from(imageGenerationLinksTable)
            .innerJoin(
                chatsTable,
                and(
                    eq(chatsTable.serverId, imageGenerationLinksTable.serverId),
                    eq(chatsTable.id, imageGenerationLinksTable.chatId)
                )
            )
            .leftJoin(
                linkParentChatsTable,
                and(
                    eq(linkParentChatsTable.serverId, chatsTable.serverId),
                    eq(linkParentChatsTable.id, chatsTable.parentChatId)
                )
            )
            .where(
                and(
                    eq(imageGenerationLinksTable.serverId, imageGenerationsTable.serverId),
                    eq(imageGenerationLinksTable.generationId, imageGenerationsTable.id),
                    linkChatVisibleSql(serverId, viewer)
                )
            )
    );
    return viewer.kind === 'agent'
        ? (or(eq(imageGenerationsTable.agentId, viewer.agentId), linked) as SQL)
        : linked;
}

/**
 * Whether an attachment is the ready image of a generation the viewer can see.
 * Generated images belong to no Message or Chat, so this is their only
 * visibility rule: exactly the generation's own.
 */
export async function isVisibleGeneratedImage(
    db: Pick<HausDatabase, 'select'>,
    input: { attachmentId: string; serverId: string; viewer: ImageGenerationViewer }
): Promise<boolean> {
    const [row] = await db
        .select({ id: imageGenerationsTable.id })
        .from(imageGenerationsTable)
        .where(
            and(
                eq(imageGenerationsTable.serverId, input.serverId),
                eq(imageGenerationsTable.attachmentId, input.attachmentId),
                eq(imageGenerationsTable.state, 'ready'),
                imageGenerationVisibleSql(db, input.serverId, input.viewer)
            )
        )
        .limit(1);
    return Boolean(row);
}

/** Which of these generation ids exist in the Server and are visible to the viewer. */
export async function readVisibleImageGenerationIds(
    db: Pick<HausDatabase, 'select'>,
    input: { generationIds: string[]; serverId: string; viewer: ImageGenerationViewer }
): Promise<Set<string>> {
    if (input.generationIds.length === 0) {
        return new Set();
    }
    const rows = await db
        .select({ id: imageGenerationsTable.id })
        .from(imageGenerationsTable)
        .where(
            and(
                eq(imageGenerationsTable.serverId, input.serverId),
                inArray(imageGenerationsTable.id, input.generationIds),
                imageGenerationVisibleSql(db, input.serverId, input.viewer)
            )
        );
    return new Set(rows.map(({ id }) => id));
}
