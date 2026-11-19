import { prepareImageGenerationEvents } from '../image-generation/image-generation-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import {
    prepareTaskLinkEvents,
    recordTaskMessageLinks,
    resolveTaskReferences,
    type TaskMessageLink,
} from '../tasks/task-reference-links.ts';
import { prepareLinkedWorkEvents } from '../workers/worker-events.ts';
import {
    type ImageGenerationLink,
    recordImageGenerationLinks,
    resolveImageGenerationLinks,
} from './image-generation-links.ts';
import { type WorkerLink, recordWorkerLinks, resolveWorkerLinks } from './worker-links.ts';

export interface ResolvedMessageLinks {
    cloudLinks: WorkerLink[];
    content: string;
    imageLinks: ImageGenerationLink[];
    /** Task references (`task://` links and bare keys) in the final content. */
    taskLinks: TaskMessageLink[];
}

/**
 * The Message-boundary link check for every kind of linked record (ADR 0044
 * and its image generation twin): Worker and image generation links
 * survive only when the author can already see the record. Task references
 * (ADR 0051) resolve against the final content and never rewrite it: every
 * Task is visible to every member and Agent. Run inside the Message's insert
 * transaction.
 */
export async function resolveMessageLinks(
    db: Pick<HausDatabase, 'select'>,
    input: {
        author: Parameters<typeof resolveWorkerLinks>[1]['author'];
        content: string;
        serverId: string;
    }
): Promise<ResolvedMessageLinks> {
    const cloud = await resolveWorkerLinks(db, input);
    const images = await resolveImageGenerationLinks(db, { ...input, content: cloud.content });
    const taskLinks = await resolveTaskReferences(db, {
        content: images.content,
        serverId: input.serverId,
    });
    return {
        cloudLinks: cloud.links,
        content: images.content,
        imageLinks: images.links,
        taskLinks,
    };
}

export async function recordMessageLinks(
    db: HausDatabase,
    input: { chatId: string; messageId: string; serverId: string } & Pick<
        ResolvedMessageLinks,
        'cloudLinks' | 'imageLinks' | 'taskLinks'
    >
): Promise<void> {
    await recordWorkerLinks(db, { ...input, links: input.cloudLinks });
    await recordImageGenerationLinks(db, { ...input, links: input.imageLinks });
    await recordTaskMessageLinks(db, { ...input, links: input.taskLinks });
}

/**
 * `worker.updated`, `imageGeneration.onUpdated`, and `task.updated` events for the
 * records a Message just linked. A Task's own record did not change, so its event repeats
 * the version: an open Task refetches its Mentioned in.
 */
export async function prepareMessageLinkEvents(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string } & Pick<
        ResolvedMessageLinks,
        'cloudLinks' | 'imageLinks' | 'taskLinks'
    >
): Promise<PreparedRealtimeEvent[]> {
    return [
        ...(await prepareLinkedWorkEvents(db, {
            serverId: input.serverId,
            workIds: input.cloudLinks.map((link) => link.workId),
        })),
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
