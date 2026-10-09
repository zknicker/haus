import type { CloudAgentStatus } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatsTable,
    cloudAgentWorkTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { findInboxSeedContext } from './seed-inbox-context.ts';
import {
    type GalleryContext,
    galleryMessage,
    galleryThread,
    galleryWork,
} from './seed-ui-gallery-records.ts';

const channelName = 'repo-health';

/**
 * One Blippy message in #repo-health whose Thread holds a fan-out of Cloud
 * Agent work, one per repository, like an Agent starting a cloud run per repo.
 * It exercises the inline Thread preview under a channel message with many
 * `cloud-agent-work` replies.
 *
 * The work reuses the UI gallery's offline, unattached Computer, whose credential
 * is discarded, so no Computer ever receives these Runs in a reconcile list
 * (`listComputerCloudAgentWork` is scoped to the reporting Computer). Running
 * rows stay static and never reach a provider. Idempotent by channel name.
 */
export async function seedDevelopmentCloudFanoutThread(
    db: HausDatabase,
    input: { serverId: string; userId: string }
) {
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [existing] = await tx
            .select({ id: chatsTable.id })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.name, channelName)))
            .limit(1);
        if (existing) {
            return;
        }
        const context = await findInboxSeedContext(tx, input);
        if (!context) {
            return;
        }
        const chatId = createOpaqueId('cht');
        const computerId = await findGalleryComputerId(tx, input.serverId);
        if (!computerId) {
            return;
        }
        await tx
            .insert(chatsTable)
            .values({ id: chatId, serverId: input.serverId, kind: 'channel', name: channelName });
        await tx.insert(channelParticipantsTable).values({ chatId, ...input });
        await tx
            .insert(channelAgentParticipantsTable)
            .values({ agentId: context.blippyId, chatId, serverId: input.serverId });

        const start = Date.now() - 5 * 60_000;
        const channel: GalleryContext = {
            ...input,
            agentId: context.blippyId,
            chatId,
            computerId,
            now: new Date(start),
        };
        const anchor = await galleryMessage(
            tx,
            channel,
            "On it. I'm starting one cloud agent per repo; their progress will show in this thread."
        );
        const thread = await galleryThread(tx, channel, anchor);
        for (const [index, [repo, status]] of fanout.entries()) {
            await galleryWork(
                tx,
                { ...thread, now: new Date(start + (index + 1) * 10_000) },
                {
                    repository: `demo/${repo.toLowerCase().replaceAll(' ', '-')}`,
                    status,
                    title: `Health standard: ${repo}`,
                }
            );
        }
    });
}

const fanout: [repo: string, status: CloudAgentStatus][] = [
    ['MerchBase Core', 'completed'],
    ['BidBeacon', 'running'],
    ['RankWrangler', 'running'],
    ['Handmade', 'failed'],
    ['Fulfillment', 'running'],
    ['Atlas', 'running'],
    ['Trademark Terminal', 'running'],
    ['Access', 'running'],
    ['document in agents repo', 'running'],
];

/** The gallery's sample Computer, found through the work it already owns. */
async function findGalleryComputerId(db: Pick<HausDatabase, 'select'>, serverId: string) {
    const [row] = await db
        .select({ computerId: cloudAgentWorkTable.computerId })
        .from(cloudAgentWorkTable)
        .innerJoin(chatsTable, eq(chatsTable.id, cloudAgentWorkTable.chatId))
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.name, 'ui-gallery')))
        .limit(1);
    return row?.computerId ?? null;
}
