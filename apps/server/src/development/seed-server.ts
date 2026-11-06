import { computerProtocolVersion } from '@haus/api';
import { eq } from 'drizzle-orm';
import { insertGeneralBoard } from '../boards/board-create.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    agentTokenUsageDailyTable,
    channelAgentParticipantsTable,
    channelParticipantsTable,
    chatMessagesTable,
    chatsTable,
    computersTable,
    mcpConnectionsTable,
    serverMembershipsTable,
    serverOnboardingTable,
    serversTable,
    threadFollowsTable,
    usersTable,
} from '../postgres/schema.ts';
import { listAccessibleServers } from '../servers/accessible-servers.ts';
import { allChannelDescription, type ServerSummary } from '../servers/contracts.ts';
import { demoTokenUsage } from './demo-token-usage.ts';
import { developmentComputerCredentialHash } from './seed-computer-attachment.ts';
import { demoAgent } from './seed-demo-agent.ts';
import { insertSeedAvatars } from './seed-demo-avatars.ts';
import { seedDemoTasks } from './seed-demo-tasks.ts';
import { ensureDevelopmentSeedSteps, type SeedDevelopmentServerOptions } from './seed-steps.ts';

const demoInventory = {
    name: 'Development Mac',
    runtimes: [
        {
            id: 'codex',
            label: 'Codex',
            models: [
                { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
                { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
            ],
        },
    ],
};

/** Creates the one idempotent Server-owned demo workspace for a signed-in dev user. */
export async function seedDevelopmentServer(
    db: HausDatabase,
    userId: string,
    options: SeedDevelopmentServerOptions = {}
): Promise<ServerSummary> {
    const existing = await listAccessibleServers(db, userId);
    if (existing[0]) {
        await ensureDevelopmentSeedSteps(db, existing[0], userId, options);
        return existing[0];
    }

    const seeded = await db.transaction(async (tx) => {
        const serverId = createOpaqueId('srv');
        const membershipId = createOpaqueId('mem');
        const channelId = createOpaqueId('cht');
        const demoChannelId = createOpaqueId('cht');
        const onboardingChannelId = createOpaqueId('cht');
        const blippyDmId = createOpaqueId('cht');
        const tinyDmId = createOpaqueId('cht');
        const computerId = createOpaqueId('cmp');
        const blippyId = createOpaqueId('agt');
        const tinyId = createOpaqueId('agt');
        const mcpId = createOpaqueId('mcp');
        const now = new Date();
        // Messages that later rows point at need stable ids, so mint them up front.
        const planMessageId = createOpaqueId('msg');
        const shipTaskMessageId = createOpaqueId('msg');
        const auditTaskMessageId = createOpaqueId('msg');
        const sizeCapMessageId = createOpaqueId('msg');
        const polishMessageId = createOpaqueId('msg');
        const threadChatId = demoThreadId(planMessageId);
        const avatarIds = await insertSeedAvatars(tx);

        await tx
            .insert(serversTable)
            .values({ displayName: 'Dev Server', id: serverId, slug: 'dev' });
        const generalBoardId = await insertGeneralBoard(tx, serverId);
        await tx.insert(serverMembershipsTable).values({
            id: membershipId,
            role: 'owner',
            serverId,
            userId,
        });
        await tx
            .update(usersTable)
            .set({ avatarId: avatarIds.owner })
            .where(eq(usersTable.id, userId));
        await tx.insert(chatsTable).values({
            description: allChannelDescription,
            id: channelId,
            isAll: true,
            kind: 'channel',
            lastActivityAt: now,
            lastMessageSequence: 6,
            name: 'all',
            serverId,
        });
        await tx.insert(chatsTable).values({
            id: onboardingChannelId,
            kind: 'channel',
            name: 'onboarding-owner',
            serverId,
        });
        await tx.insert(chatsTable).values({
            id: demoChannelId,
            kind: 'channel',
            lastActivityAt: now,
            lastMessageSequence: 2,
            name: 'product',
            serverId,
        });
        await tx.insert(channelParticipantsTable).values(
            [channelId, demoChannelId, onboardingChannelId].map((chatId) => ({
                chatId,
                serverId,
                userId,
            }))
        );
        await tx.insert(computersTable).values({
            architecture: process.arch,
            attachedByUserId: userId,
            credentialHash: developmentComputerCredentialHash(serverId, computerId),
            health: 'offline',
            id: computerId,
            operatingSystem: process.platform,
            productVersion: 'dev',
            protocolVersion: computerProtocolVersion,
            reportedInventory: demoInventory,
            serverId,
        });
        await tx.insert(serverOnboardingTable).values({
            channelId: onboardingChannelId,
            computerId,
            phase: 'complete',
            serverId,
        });
        await tx.insert(agentsTable).values([
            demoAgent({
                avatarId: avatarIds.blippy,
                computerId,
                createdByUserId: userId,
                description: 'Keeps the plan tight and surfaces decisions early.',
                displayName: 'Blippy',
                handle: 'blippy',
                id: blippyId,
                modelId: 'gpt-5.6-sol',
                reportedAt: now,
                serverId,
            }),
            demoAgent({
                avatarId: avatarIds.tiny,
                computerId,
                createdByUserId: userId,
                description: 'Pressure-tests the details and keeps the work grounded.',
                displayName: 'Tiny',
                handle: 'tiny',
                id: tinyId,
                modelId: 'gpt-5.6-terra',
                reportedAt: now,
                serverId,
            }),
        ]);
        await tx
            .insert(chatsTable)
            .values([
                demoAgentDm(blippyDmId, blippyId, serverId, userId, now, 1),
                demoAgentDm(tinyDmId, tinyId, serverId, userId, now, 1),
            ]);
        await tx.insert(channelAgentParticipantsTable).values([
            { agentId: blippyId, chatId: channelId, serverId },
            { agentId: tinyId, chatId: channelId, serverId },
            { agentId: blippyId, chatId: demoChannelId, serverId },
            { agentId: tinyId, chatId: demoChannelId, serverId },
        ]);
        await tx.insert(chatMessagesTable).values([
            demoMessage(serverId, channelId, 1, {
                authorUserId: userId,
                content: 'Morning team — what should we focus on today?',
            }),
            demoMessage(serverId, channelId, 2, {
                authorAgentId: blippyId,
                content: 'I’ll keep the plan tight and surface decisions early.',
            }),
            demoMessage(serverId, channelId, 3, {
                authorAgentId: tinyId,
                content: 'I’ll pressure-test the details and keep the work grounded.',
            }),
            demoMessage(
                serverId,
                channelId,
                4,
                {
                    authorUserId: userId,
                    content: 'Here’s the plan for the week — shout if anything looks wrong.',
                },
                planMessageId
            ),
            demoMessage(
                serverId,
                channelId,
                5,
                {
                    authorUserId: userId,
                    content: 'Ship the avatar upload flow end to end.',
                },
                shipTaskMessageId
            ),
            demoMessage(
                serverId,
                channelId,
                6,
                {
                    authorAgentId: tinyId,
                    content: 'Audit the member directory for stale copy.',
                },
                auditTaskMessageId
            ),
            demoMessage(serverId, demoChannelId, 1, {
                authorUserId: userId,
                content: 'What should we polish next?',
            }),
            demoMessage(
                serverId,
                demoChannelId,
                2,
                {
                    authorAgentId: blippyId,
                    content: 'The core flow first. GEN-4 tracks it, so everything else can wait.',
                },
                polishMessageId
            ),
            demoMessage(serverId, blippyDmId, 1, {
                authorAgentId: blippyId,
                content: 'Blippy online. What are we building?',
            }),
            demoMessage(serverId, tinyDmId, 1, {
                authorAgentId: tinyId,
                content: 'Tiny here. Send me the sharp edges.',
            }),
        ]);

        // Each Task's source message carries its deterministic Thread, and the plan
        // message has a discussion thread the author follows.
        await tx
            .insert(chatsTable)
            .values([
                demoThread(serverId, channelId, planMessageId, now, 3),
                demoThread(serverId, channelId, shipTaskMessageId, now, 0),
                demoThread(serverId, channelId, auditTaskMessageId, now, 0),
            ]);
        await tx.insert(threadFollowsTable).values({
            followed: true,
            serverId,
            threadChatId,
            userId,
        });

        await tx.insert(chatMessagesTable).values([
            demoMessage(serverId, threadChatId, 1, {
                authorAgentId: blippyId,
                content: 'Reading it now — the sequencing looks right to me.',
            }),
            demoMessage(
                serverId,
                threadChatId,
                2,
                {
                    authorAgentId: tinyId,
                    content: 'One risk: the upload path needs a size cap. Filed it as GEN-3.',
                },
                sizeCapMessageId
            ),
            demoMessage(serverId, threadChatId, 3, {
                authorUserId: userId,
                content: 'Good catch — folding that in.',
            }),
        ]);

        // Four Tasks on the General board: one in flight and one waiting with the
        // Agents, and two handed to the owner, one discussed in a Thread.
        const blippy = { agentId: blippyId, kind: 'agent' } as const;
        const tiny = { agentId: tinyId, kind: 'agent' } as const;
        const owner = { kind: 'user', userId } as const;
        await seedDemoTasks(tx, {
            boardId: generalBoardId,
            serverId,
            tasks: [
                {
                    assignee: blippy,
                    category: 'active',
                    createdBy: owner,
                    messageId: shipTaskMessageId,
                    priority: 'high',
                    title: 'Ship the avatar upload flow end to end',
                },
                {
                    assignee: tiny,
                    category: 'todo',
                    createdBy: tiny,
                    messageId: auditTaskMessageId,
                    priority: 'medium',
                    title: 'Audit the member directory for stale copy',
                },
                {
                    assignee: owner,
                    category: 'todo',
                    createdBy: tiny,
                    messageId: sizeCapMessageId,
                    priority: 'high',
                    title: 'Pick the upload size cap',
                },
                {
                    assignee: owner,
                    category: 'todo',
                    createdBy: blippy,
                    messageId: polishMessageId,
                    priority: 'medium',
                    title: 'Sign off on the core flow polish list',
                },
            ],
        });

        // One Server-managed MCP connection for the Agent Connections surface to grant.
        await tx.insert(mcpConnectionsTable).values({
            auth: 'none',
            connected: true,
            headerNames: [],
            id: mcpId,
            name: 'Demo Tools',
            serverId,
            tools: ['search_docs', 'fetch_page'],
            url: 'https://example.invalid/mcp',
        });

        // Ninety days of usage populate every dashboard range.
        await tx.insert(agentTokenUsageDailyTable).values(
            demoTokenUsage(serverId, now, [
                { id: blippyId, modelId: 'gpt-5.6-sol', weight: 1 },
                { id: tinyId, modelId: 'gpt-5.6-terra', weight: 0.55 },
            ])
        );

        return { displayName: 'Dev Server', id: serverId, role: 'owner' as const, slug: 'dev' };
    });
    await ensureDevelopmentSeedSteps(db, seeded, userId, options);
    return seeded;
}

/** Mirrors the deterministic anchor id used by `ensureThread`. */
function demoThreadId(anchorMessageId: string) {
    return `cht_thr_${anchorMessageId.replace(/^msg_/u, '')}`;
}

function demoThread(
    serverId: string,
    parentChatId: string,
    anchorMessageId: string,
    lastActivityAt: Date,
    lastMessageSequence: number
) {
    return {
        anchorMessageId,
        id: demoThreadId(anchorMessageId),
        kind: 'thread' as const,
        lastActivityAt,
        lastMessageSequence,
        parentChatId,
        parentChatKind: 'channel' as const,
        serverId,
    };
}

function demoAgentDm(
    id: string,
    agentId: string,
    serverId: string,
    userId: string,
    lastActivityAt: Date,
    lastMessageSequence: number
) {
    return {
        dmAgentId: agentId,
        dmMemberOneStint: 1,
        dmMemberOneUserId: userId,
        id,
        kind: 'dm' as const,
        lastActivityAt,
        lastMessageSequence,
        serverId,
    };
}

function demoMessage(
    serverId: string,
    chatId: string,
    sequence: number,
    author: { authorAgentId: string; content: string } | { authorUserId: string; content: string },
    id = createOpaqueId('msg')
) {
    return {
        ...author,
        chatId,
        id,
        nonce: `dev-${chatId}-${sequence}`,
        replyRootMessageId: id,
        sequence,
        serverId,
    };
}
