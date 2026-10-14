import { prepareLinkedWorkEvents } from '../cloud-agents/cloud-agent-events.ts';
import { prepareImageGenerationEvents } from '../image-generation/image-generation-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import {
    type CloudAgentWorkLink,
    recordCloudAgentWorkLinks,
    resolveCloudAgentWorkLinks,
} from './cloud-agent-work-links.ts';
import {
    type ImageGenerationLink,
    recordImageGenerationLinks,
    resolveImageGenerationLinks,
} from './image-generation-links.ts';

export interface ResolvedMessageLinks {
    cloudLinks: CloudAgentWorkLink[];
    content: string;
    imageLinks: ImageGenerationLink[];
}

/**
 * The Message-boundary link check for every kind of linked record (ADR 0044
 * and its image generation twin): Cloud Agent work and image generation links
 * survive only when the author can already see the record. Run inside the
 * Message's insert transaction.
 */
export async function resolveMessageLinks(
    db: Pick<HausDatabase, 'select'>,
    input: {
        author: Parameters<typeof resolveCloudAgentWorkLinks>[1]['author'];
        content: string;
        serverId: string;
    }
): Promise<ResolvedMessageLinks> {
    const cloud = await resolveCloudAgentWorkLinks(db, input);
    const images = await resolveImageGenerationLinks(db, { ...input, content: cloud.content });
    return { cloudLinks: cloud.links, content: images.content, imageLinks: images.links };
}

export async function recordMessageLinks(
    db: HausDatabase,
    input: { chatId: string; messageId: string; serverId: string } & Pick<
        ResolvedMessageLinks,
        'cloudLinks' | 'imageLinks'
    >
): Promise<void> {
    await recordCloudAgentWorkLinks(db, { ...input, links: input.cloudLinks });
    await recordImageGenerationLinks(db, { ...input, links: input.imageLinks });
}

/** `cloudAgentWork.updated` and `imageGeneration.onUpdated` events for the records a Message just linked. */
export async function prepareMessageLinkEvents(
    db: Pick<HausDatabase, 'select'>,
    input: { serverId: string } & Pick<ResolvedMessageLinks, 'cloudLinks' | 'imageLinks'>
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
    ];
}
