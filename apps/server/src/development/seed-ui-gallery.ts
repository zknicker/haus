import { createHash, randomBytes } from 'node:crypto';
import type { WorkerTurnStatus, MessageClaim } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { channelParticipantsTable, chatsTable, computersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { findInboxSeedContext } from './seed-inbox-context.ts';
import {
    type GalleryContext,
    galleryClaim,
    galleryMention,
    galleryMessage,
    galleryReplies,
    galleryWork,
} from './seed-ui-gallery-records.ts';

export async function seedDevelopmentUiGallery(
    db: HausDatabase,
    input: { serverId: string; userId: string }
) {
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const [existing] = await tx
            .select({ id: chatsTable.id })
            .from(chatsTable)
            .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.name, 'ui-gallery')))
            .limit(1);
        if (existing) {
            return;
        }
        const context = await findInboxSeedContext(tx, input);
        if (!context) {
            return;
        }
        const chatId = createOpaqueId('cht');
        const computerId = createOpaqueId('cmp');
        // Discard the random credential: no Computer can reconcile or launch these sample runs.
        await tx.insert(computersTable).values({
            id: computerId,
            serverId: input.serverId,
            attachedByUserId: input.userId,
            credentialHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
            health: 'offline',
            reportedInventory: { name: 'UI gallery (unattached samples)', runtimes: [] },
        });
        await tx
            .insert(chatsTable)
            .values({ id: chatId, serverId: input.serverId, kind: 'channel', name: 'ui-gallery' });
        await tx.insert(channelParticipantsTable).values({ chatId, ...input });
        const gallery: GalleryContext = {
            ...input,
            chatId,
            computerId,
            agentId: context.tinyId,
            now: new Date(),
        };
        await galleryMessage(
            tx,
            gallery,
            'UI gallery: compact attachments and inline replies. Toggle “Show claims in chat” to reveal claims. Compare inline @mentions and full cloud-work cards. All cloud runs here are static samples on an unattached Computer; no provider links or jobs are created.'
        );
        await seedMentionExamples(tx, gallery);
        await seedClaimExamples(tx, gallery);
        await seedCloudExamples(tx, gallery);
        await seedCombinedExamples(tx, gallery);
    });
}

async function seedMentionExamples(db: HausDatabase, context: GalleryContext) {
    await galleryMention(db, context, {
        content: 'Open @mention · Should we rename #product to #build?',
        answered: false,
    });
    await galleryMention(db, context, {
        content: 'Open @mention with discussion · Should we simplify the welcome screen?',
        answered: false,
        discussion: true,
    });
    await galleryMention(db, context, {
        content: 'Answered @mention · The reply sits inline under it.',
        answered: true,
    });
    const plain = await galleryMessage(
        db,
        context,
        'Ordinary conversation · A discussion with no claim, @mention, or cloud work.'
    );
    await galleryMessage(
        db,
        galleryReplies(context, plain),
        'This inline reply answers the message above.'
    );
}

async function seedClaimExamples(db: HausDatabase, context: GalleryContext) {
    const states: MessageClaim['status'][] = ['todo', 'in_progress', 'in_review', 'done', 'closed'];
    for (const status of states) {
        const message = await galleryMessage(
            db,
            context,
            `Tracked claim · ${status} · Hidden until “Show claims in chat” is enabled.`
        );
        await galleryClaim(db, context, message, 'tracked', status);
    }
    for (const status of ['in_progress', 'done'] satisfies MessageClaim['status'][]) {
        const message = await galleryMessage(
            db,
            context,
            `Background claim · ${status} · Hidden until “Show claims in chat” is enabled.`
        );
        await galleryClaim(db, context, message, 'background', status);
    }
    const claimed = await galleryMessage(
        db,
        context,
        'Claim with replies · Its claim metadata shows even when the preference is off.'
    );
    await galleryClaim(db, context, claimed, 'background', 'in_progress');
    await galleryMessage(
        db,
        galleryReplies(context, claimed),
        'I found the cause and am working on the fix.'
    );
}

async function seedCloudExamples(db: HausDatabase, context: GalleryContext) {
    const states: WorkerTurnStatus[] = [
        'queued',
        'running',
        'pending_input',
        'completed',
        'failed',
        'cancelled',
        'expired',
    ];
    const stateTitles: Record<WorkerTurnStatus, string> = {
        queued: 'Compact attachment previews',
        running: 'Tighten sidebar spacing',
        pending_input: 'Pick the onboarding copy variant',
        completed: 'Rename Computer settings labels',
        failed: 'Migrate reminder schedules',
        cancelled: 'Draft release notes',
        expired: 'Audit empty-state copy',
    };
    for (const status of states) {
        await galleryWork(db, context, {
            title: stateTitles[status],
            status,
            withBranch: status === 'completed',
        });
    }
    await galleryWork(db, context, {
        title: 'Accessibility pass on settings',
        status: 'running',
        cancelling: true,
    });
    await galleryWork(db, context, {
        title: 'Fix stale reminder copy',
        status: 'running',
        stale: true,
    });
    for (const [title, status, followUp] of [
        ['Fix the reminder retry · follow-up waiting', 'completed', 'waiting'],
        ['Fix the reminder retry · follow-up running', 'completed', 'running'],
        ['Migrate settings storage · follow-up after failure', 'failed', 'waiting'],
    ] as const) {
        await galleryWork(db, context, {
            followUp,
            status,
            title,
            withBranch: status === 'completed',
        });
    }
    for (const [title, status] of [
        ['Claude · Trim the settings copy', 'running'],
        ['Claude · Pick the reminder default', 'pending_input'],
        ['Claude · Rename the inbox labels', 'completed'],
        ['Claude · Migrate the digest schedule', 'failed'],
        ['Claude · Draft the changelog', 'cancelled'],
    ] as const) {
        await galleryWork(db, context, {
            provider: 'claude',
            status,
            title,
            withBranch: status === 'completed',
        });
    }
    const discussed = await galleryWork(db, context, {
        title: 'Review the navigation fix',
        status: 'completed',
        withBranch: true,
    });
    await galleryMessage(
        db,
        galleryReplies(context, discussed),
        'The branch is ready for review. The work card carries its status.'
    );
}

async function seedCombinedExamples(db: HausDatabase, context: GalleryContext) {
    const anchor = await galleryMessage(
        db,
        context,
        'Claim + multiple cloud runs + inline @mentions · Its replies hold the full combination.'
    );
    await galleryClaim(db, context, anchor, 'tracked', 'in_review');
    const replies = galleryReplies(context, anchor);
    await galleryWork(db, replies, {
        title: 'Keyboard navigation · Completed branch',
        status: 'completed',
        withBranch: true,
    });
    await galleryWork(db, replies, { title: 'Accessibility pass · Running', status: 'running' });
    await galleryMention(db, replies, {
        content: 'Answered inline @mention · Your reply follows it.',
        answered: true,
    });
    await galleryMention(db, replies, {
        content: 'Open inline @mention · Is the new focus order right?',
        answered: false,
    });
    const claimMention = await galleryMention(db, context, {
        content: 'Claim + @mention · Should I ship the new sidebar?',
        answered: false,
    });
    await galleryClaim(db, context, claimMention, 'tracked', 'in_review');
}
