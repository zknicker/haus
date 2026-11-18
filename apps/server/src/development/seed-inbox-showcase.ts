import { formatUserReferenceTarget } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentTokenUsageDailyTable,
    chatMessagesTable,
    serverMembershipsTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { demoTokenUsage } from './demo-token-usage.ts';
import { findInboxSeedContext, type InboxSeedContext } from './seed-inbox-context.ts';
import { appendSeedMessages } from './seed-inbox-messages.ts';

/** The first Message this step writes; its nonce marks the conversations as seeded. */
const showcaseAnchorNonce = 'dev-inbox-showcase-product-anchor';

const minute = 60_000;

export async function seedDevelopmentInboxShowcase(
    db: HausDatabase,
    input: { serverId: string; userId: string }
): Promise<void> {
    await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const context = await findInboxSeedContext(tx, input);
        if (!context) {
            return;
        }
        const now = new Date();
        await topUpTokenUsage(tx, context, now);
        if (!(await alreadySeeded(tx, context.serverId))) {
            await seedProductConversation(tx, context, now);
            await seedTinyDmConversation(tx, context, now);
        }
    });
}

/** Ninety days for every demo Agent, missing days only, then today's runaway. */
async function topUpTokenUsage(tx: HausDatabase, context: InboxSeedContext, now: Date) {
    await tx
        .insert(agentTokenUsageDailyTable)
        .values(
            demoTokenUsage(context.serverId, now, [
                { id: context.blippyId, modelId: 'gpt-5.6-sol', weight: 1 },
                { id: context.tinyId, modelId: 'gpt-5.6-terra', weight: 0.55 },
                { id: context.coveId, modelId: 'gpt-5.6-sol', weight: 0.4 },
            ])
        )
        .onConflictDoNothing();

    // Tiny's afternoon on a second model: far over its usual day and over the
    // spike floor, so its rail row and strip chip carry the warning.
    const spike = { cacheRead: 3_900_000, cacheWrite: 410_000, input: 5_800_000, output: 640_000 };
    const row = {
        agentId: context.tinyId,
        cacheReadTokens: spike.cacheRead,
        cacheWriteTokens: spike.cacheWrite,
        date: now.toISOString().slice(0, 10),
        inputTokens: spike.input,
        modelId: 'gpt-5.6-sol',
        outputTokens: spike.output,
        runtimeId: 'codex',
        serverId: context.serverId,
        totalTokens: spike.input + spike.output,
        turnCount: 212,
    };
    await tx
        .insert(agentTokenUsageDailyTable)
        .values(row)
        .onConflictDoUpdate({
            set: { ...row },
            target: [
                agentTokenUsageDailyTable.serverId,
                agentTokenUsageDailyTable.date,
                agentTokenUsageDailyTable.agentId,
                agentTokenUsageDailyTable.runtimeId,
                agentTokenUsageDailyTable.modelId,
            ],
        });
}

/**
 * Blippy's report in #product, with Tiny correcting it and Blippy asking the
 * owner to decide, as inline replies under the report: the conversation a
 * person gets notified about and has to find.
 */
async function seedProductConversation(tx: HausDatabase, context: InboxSeedContext, now: Date) {
    const mention = await ownerMention(tx, context);
    const [anchor] = await appendSeedMessages(tx, {
        chatId: context.productChatId,
        messages: [
            {
                authorAgentId: context.blippyId,
                content:
                    'Thursday release check (report only, no changes). Headline: the badge fix cut duplicate digest reminders to zero, but two flaky specs are still blocking the release branch.',
                createdAt: before(now, 50 * minute),
                nonce: showcaseAnchorNonce,
            },
        ],
        serverId: context.serverId,
    });
    if (!anchor) {
        throw new Error('The Inbox showcase seed wrote no #product anchor.');
    }
    const reply = { rootMessageId: anchor.id, toMessageId: anchor.id };
    await appendSeedMessages(tx, {
        chatId: context.productChatId,
        messages: [
            {
                authorAgentId: context.tinyId,
                content: `${mention} one correction on the flaky specs. Last week's runs show why they're not the release blocker:\n\n- **render-budget:** over its limit in 2 of 6 runs on this branch, 0 of 6 on main. Same noise either way.\n- **cloud-agent-work-links:** fails on main too. It still expects "Working" for queued work that now reads "Starting".\n\nSo the branch is clean. The real blocker is the migration check, which has failed **3 runs in a row** since Tuesday.`,
                createdAt: before(now, 22 * minute),
                nonce: 'dev-inbox-showcase-product-tiny',
                reply,
            },
            {
                authorAgentId: context.blippyId,
                content: `Right, thanks Tiny. **The specs are noise; the migration check is the blocker.** ${mention}, the plan is then:\n\n- Update the stale "Working" expectation to "Starting"\n- Re-run render-budget twice before calling it\n- Pair with Cove on the migration check this afternoon\n\nGo?`,
                createdAt: before(now, 9 * minute),
                nonce: 'dev-inbox-showcase-product-blippy',
                reply,
            },
        ],
        serverId: context.serverId,
    });
}

async function seedTinyDmConversation(tx: HausDatabase, context: InboxSeedContext, now: Date) {
    const [anchor] = await appendSeedMessages(tx, {
        chatId: context.tinyDmChatId,
        messages: [
            {
                authorUserId: context.userId,
                content: 'Can you price out moving the nightly backup to the mini?',
                createdAt: before(now, 2 * 60 * minute),
                nonce: 'dev-inbox-showcase-dm-anchor',
            },
        ],
        serverId: context.serverId,
    });
    if (!anchor) {
        throw new Error('The Inbox showcase seed wrote no DM anchor.');
    }
    const reply = { rootMessageId: anchor.id, toMessageId: anchor.id };
    await appendSeedMessages(tx, {
        chatId: context.tinyDmChatId,
        messages: [
            {
                authorAgentId: context.tinyId,
                content:
                    'Priced it. The mini runs the backup in about **14 minutes** versus 9 on the laptop, and it frees the laptop overnight.',
                createdAt: before(now, 34 * minute),
                nonce: 'dev-inbox-showcase-dm-tiny-1',
                reply,
            },
            {
                authorAgentId: context.tinyId,
                content:
                    'Two catches:\n\n1. The mini is two releases behind, so it needs `haus-computer upgrade` first.\n2. Its tailnet key expires Friday.\n\nWant me to do both tonight and move the backup after?',
                createdAt: before(now, 33 * minute),
                nonce: 'dev-inbox-showcase-dm-tiny-2',
                reply,
            },
        ],
        serverId: context.serverId,
    });
}

async function ownerMention(tx: HausDatabase, context: InboxSeedContext): Promise<string> {
    const [owner] = await tx
        .select({ handle: serverMembershipsTable.handle })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, context.serverId),
                eq(serverMembershipsTable.userId, context.userId)
            )
        )
        .limit(1);
    return `[@${owner?.handle ?? 'owner'}](${formatUserReferenceTarget(context.userId)})`;
}

async function alreadySeeded(tx: HausDatabase, serverId: string): Promise<boolean> {
    const [marker] = await tx
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, serverId),
                eq(chatMessagesTable.nonce, showcaseAnchorNonce)
            )
        )
        .limit(1);
    return Boolean(marker);
}

function before(now: Date, ms: number): Date {
    return new Date(now.getTime() - ms);
}
