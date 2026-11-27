import type { MessageClaim } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { channelParticipantsTable, chatsTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { findInboxSeedContext } from './seed-inbox-context.ts';
import {
    type GalleryContext,
    galleryClaim,
    galleryMention,
    galleryMessage,
    galleryReplies,
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
        await tx
            .insert(chatsTable)
            .values({ id: chatId, serverId: input.serverId, kind: 'channel', name: 'ui-gallery' });
        await tx.insert(channelParticipantsTable).values({ chatId, ...input });
        const gallery: GalleryContext = {
            ...input,
            chatId,
            agentId: context.tinyId,
            now: new Date(),
        };
        await galleryMessage(
            tx,
            gallery,
            'UI gallery: compact attachments and inline replies. Toggle “Show claims in chat” to reveal claims, and compare inline @mentions.'
        );
        await seedMentionExamples(tx, gallery);
        await seedClaimExamples(tx, gallery);
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
        'Ordinary conversation · A discussion with no claim or @mention.'
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

async function seedCombinedExamples(db: HausDatabase, context: GalleryContext) {
    const anchor = await galleryMessage(
        db,
        context,
        'Claim + inline @mentions · Its replies hold the full combination.'
    );
    await galleryClaim(db, context, anchor, 'tracked', 'in_review');
    const replies = galleryReplies(context, anchor);
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
