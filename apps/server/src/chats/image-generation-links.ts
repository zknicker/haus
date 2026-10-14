import { parseHausRichReferences, parseImageGenerationReferenceTarget } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import {
    type ImageGenerationViewer,
    readVisibleImageGenerationIds,
} from '../image-generation/image-generation-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { imageGenerationLinksTable } from '../postgres/schema.ts';

export interface ImageGenerationLink {
    generationId: string;
    ordinal: number;
}

export interface ResolvedImageGenerationLinks {
    content: string;
    links: ImageGenerationLink[];
}

/**
 * The Message-boundary operation every writer runs (ADR 0044 pattern): an
 * `image-generation://` link survives only when the generation exists and the
 * author can already see it; any other becomes its plain label text. Links
 * dedupe by first occurrence. Run inside the transaction that holds the Server
 * lock and inserts the Message, then record with `recordImageGenerationLinks`.
 */
export async function resolveImageGenerationLinks(
    db: Pick<HausDatabase, 'select'>,
    input: { author: ImageGenerationViewer; content: string; serverId: string }
): Promise<ResolvedImageGenerationLinks> {
    const generationIds = readLinkedGenerationIds(input.content);
    if (generationIds.length === 0) {
        return { content: input.content, links: [] };
    }
    const visible = await readVisibleImageGenerationIds(db, {
        generationIds,
        serverId: input.serverId,
        viewer: input.author,
    });
    return applyImageGenerationLinks(input.content, visible);
}

/**
 * Keeps links whose generation id is in `allowed` and rewrites every other
 * `image-generation://` link to its label, repeating until none is left: a
 * rewrite can join text into new link syntax. Replay passes the links a
 * Message recorded, so a retry reproduces the stored content exactly.
 */
export function applyImageGenerationLinks(
    content: string,
    allowed: ReadonlySet<string>
): ResolvedImageGenerationLinks {
    let current = content;
    for (;;) {
        const rejected = parseHausRichReferences(current).filter((reference) => {
            const generationId = generationIdOf(reference);
            return generationId !== null && !allowed.has(generationId);
        });
        if (rejected.length === 0) {
            break;
        }
        for (const reference of rejected.reverse()) {
            current =
                current.slice(0, reference.start) + reference.label + current.slice(reference.end);
        }
    }
    return {
        content: current,
        links: readLinkedGenerationIds(current).map((generationId, ordinal) => ({
            generationId,
            ordinal,
        })),
    };
}

/** Inserts one Message's links; the caller already holds the Server lock. */
export async function recordImageGenerationLinks(
    db: HausDatabase,
    input: { chatId: string; links: ImageGenerationLink[]; messageId: string; serverId: string }
): Promise<void> {
    if (input.links.length === 0) {
        return;
    }
    await db.insert(imageGenerationLinksTable).values(
        input.links.map((link) => ({
            chatId: input.chatId,
            generationId: link.generationId,
            messageId: input.messageId,
            ordinal: link.ordinal,
            serverId: input.serverId,
        }))
    );
}

/** The content a replayed send must match: authorization the original send recorded. */
export async function replayImageGenerationLinks(
    db: Pick<HausDatabase, 'select'>,
    input: { content: string; messageId: string; serverId: string }
): Promise<string> {
    const rows = await db
        .select({ generationId: imageGenerationLinksTable.generationId })
        .from(imageGenerationLinksTable)
        .where(
            and(
                eq(imageGenerationLinksTable.serverId, input.serverId),
                eq(imageGenerationLinksTable.messageId, input.messageId)
            )
        )
        .orderBy(asc(imageGenerationLinksTable.ordinal));
    return applyImageGenerationLinks(
        input.content,
        new Set(rows.map(({ generationId }) => generationId))
    ).content;
}

function readLinkedGenerationIds(content: string): string[] {
    const ids = new Set<string>();
    for (const reference of parseHausRichReferences(content)) {
        const generationId = generationIdOf(reference);
        if (generationId !== null) {
            ids.add(generationId);
        }
    }
    return [...ids];
}

function generationIdOf(reference: { id: string; kind: string }): string | null {
    return reference.kind === 'image-generation'
        ? parseImageGenerationReferenceTarget(reference.id)
        : null;
}
