import { createHash, randomBytes } from 'node:crypto';
import type { CloudAgentStatus, MessageTask } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { channelParticipantsTable, chatsTable, computersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { findInboxSeedContext } from './seed-inbox-context.ts';
import {
    type GalleryContext,
    galleryAsk,
    galleryMessage,
    galleryTask,
    galleryThread,
    galleryWork,
} from './seed-ui-gallery-records.ts';

/** Idempotent gallery, separate from the Inbox seed so existing dev workspaces gain it too. */
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
            agentId: context.coveId,
            now: new Date(),
        };
        await galleryMessage(
            tx,
            gallery,
            'UI gallery: compact attachments and populated threads. Toggle “Show tasks in chat” to reveal background claims. Open threads to compare inline asks and full cloud-work cards. All cloud runs here are static samples on an unattached Computer; no provider links or jobs are created.'
        );
        await seedAskExamples(tx, gallery);
        await seedTaskExamples(tx, gallery);
        await seedCloudExamples(tx, gallery);
        await seedCombinedExamples(tx, gallery);
    });
}

async function seedAskExamples(db: HausDatabase, context: GalleryContext) {
    await galleryAsk(db, context, {
        content: 'Open ask · Should we rename #product to #build?',
        answered: false,
    });
    await galleryAsk(db, context, {
        content: 'Open question · What should we polish next?',
        answered: false,
        options: [],
    });
    await galleryAsk(db, context, {
        content: 'Open ask with discussion · Should we simplify the welcome screen?',
        answered: false,
        discussion: true,
    });
    await galleryAsk(db, context, {
        content: 'Answered ask · The question remains, but its Ask marker is gone.',
        answered: true,
    });
    const plain = await galleryMessage(
        db,
        context,
        'Ordinary thread · A discussion with no task, ask, or cloud work.'
    );
    await galleryMessage(
        db,
        await galleryThread(db, context, plain),
        'This reply gives the message a thread card.'
    );
}

async function seedTaskExamples(db: HausDatabase, context: GalleryContext) {
    const states: MessageTask['status'][] = ['todo', 'in_progress', 'in_review', 'done', 'closed'];
    for (const status of states) {
        const message = await galleryMessage(
            db,
            context,
            `Visible task · ${status} · No replies yet.`
        );
        await galleryTask(db, context, message, 'composed', status);
    }
    for (const status of ['in_progress', 'done'] satisfies MessageTask['status'][]) {
        const message = await galleryMessage(
            db,
            context,
            `Background claim · ${status} · Hidden until “Show tasks in chat” is enabled.`
        );
        await galleryTask(db, context, message, 'claimed', status);
    }
    const claimed = await galleryMessage(
        db,
        context,
        'Claim with replies · Its task metadata shows even when the preference is off.'
    );
    await galleryTask(db, context, claimed, 'claimed', 'in_progress');
    await galleryMessage(
        db,
        await galleryThread(db, context, claimed),
        'I found the cause and am working on the fix.'
    );
}

async function seedCloudExamples(db: HausDatabase, context: GalleryContext) {
    const states: CloudAgentStatus[] = [
        'queued',
        'running',
        'completed',
        'failed',
        'cancelled',
        'expired',
    ];
    for (const status of states) {
        const work = await galleryWork(db, context, {
            title: `Cloud work · ${status} · Compact attachment`,
            status,
            withBranch: status === 'completed',
        });
        await galleryThread(db, context, work);
    }
    const cancelling = await galleryWork(db, context, {
        title: 'Cloud work · Cancelling',
        status: 'running',
        cancelling: true,
    });
    await galleryThread(db, context, cancelling);
    const stale = await galleryWork(db, context, {
        title: 'Cloud work · Stale progress',
        status: 'running',
        stale: true,
    });
    await galleryThread(db, context, stale);
    const discussed = await galleryWork(db, context, {
        title: 'Cloud work with replies · Review the navigation fix',
        status: 'completed',
        withBranch: true,
    });
    await galleryMessage(
        db,
        await galleryThread(db, context, discussed),
        'The branch is ready for review. The thread card carries the work status.'
    );
}

async function seedCombinedExamples(db: HausDatabase, context: GalleryContext) {
    const anchor = await galleryMessage(
        db,
        context,
        'Task + multiple cloud runs + inline asks · Open this thread to see the full combination.'
    );
    await galleryTask(db, context, anchor, 'converted', 'in_review');
    const thread = await galleryThread(db, context, anchor);
    await galleryWork(db, thread, {
        title: 'Keyboard navigation · Completed branch',
        status: 'completed',
        withBranch: true,
    });
    await galleryWork(db, thread, { title: 'Accessibility pass · Running', status: 'running' });
    await galleryAsk(db, thread, {
        content: 'Answered inline ask · This message has no Ask marker.',
        answered: true,
        inThread: true,
    });
    await galleryAsk(db, thread, {
        content: 'Open inline ask · Is the new focus order right?',
        answered: false,
        inThread: true,
    });
    const openTaskAsk = await galleryAsk(db, context, {
        content: 'Task + open Ask · Should I ship the new sidebar?',
        answered: false,
    });
    await galleryTask(db, context, openTaskAsk, 'converted', 'in_review');
    const answeredTaskAsk = await galleryAsk(db, context, {
        content: 'Task + answered Ask · Only task metadata and replies remain.',
        answered: true,
    });
    await galleryTask(db, context, answeredTaskAsk, 'converted', 'done');
}
