import { prepareImageGenerationEvents } from '../image-generation/image-generation-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import {
    prepareTaskLinkEvents,
    recordTaskMessageLinks,
    resolveTaskReferences,
    type TaskMessageLink,
} from '../tasks/task-reference-links.ts';
import {
    type ImageGenerationLink,
    recordImageGenerationLinks,
    resolveImageGenerationLinks,
} from './image-generation-links.ts';
import type { LinkViewer } from './link-visibility.ts';

export interface ResolvedMessageLinks {
    content: string;
    imageLinks: ImageGenerationLink[];
    /** Task references (`task://` links and bare keys) in the final content. */
    taskLinks: TaskMessageLink[];
}

/**
 * The Message-boundary link check for every kind of linked record (ADR 0044's
 * pattern): image generation links survive only when the author can already
 * see the record. Task references
 * (ADR 0051) resolve against the final content and never rewrite it: every
 * Task is visible to every member and Agent. Run inside the Message's insert
 * transaction.
 */
export async function resolveMessageLinks(
    db: Pick<HausDatabase, 'select'>,
    input: {
        author: LinkViewer;
        content: string;
        serverId: string;
    }
): Promise<ResolvedMessageLinks> {
    const images = await resolveImageGenerationLinks(db, input);
    const taskLinks = await resolveTaskReferences(db, {
        content: images.content,
        serverId: input.serverId,
    });
    return {
        content: images.content,
        imageLinks: images.links,
        taskLinks,
    };
}

export async function recordMessageLinks(
    db: HausDatabase,
    input: { chatId: string; messageId: string; serverId: string } & Pick<
        ResolvedMessageLinks,
        'imageLinks' | 'taskLinks'
    >
): Promise<void> {
    await recordImageGenerationLinks(db, { ...input, links: input.imageLinks });
    await recordTaskMessageLinks(db, { ...input, links: input.taskLinks });
}

/**
 * `imageGeneration.onUpdated` and `task.updated` events for the records a
 * Message just linked. A Task's own record did not change, so its event repeats
 * the version: an open Task refetches its Mentioned in.
 */
export async function prepareMessageLinkEvents(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string } & Pick<ResolvedMessageLinks, 'imageLinks' | 'taskLinks'>
): Promise<PreparedRealtimeEvent[]> {
    return [
        ...(await prepareImageGenerationEvents(db, {
            generationIds: input.imageLinks.map((link) => link.generationId),
            serverId: input.serverId,
        })),
        ...(await prepareTaskLinkEvents(db, {
            serverId: input.serverId,
            taskIds: input.taskLinks.map((link) => link.taskId),
        })),
    ];
}
