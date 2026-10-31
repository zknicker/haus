import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, like, sql } from 'drizzle-orm';
import { z } from 'zod';
import { dreamDedupeKey, heartbeatDedupeKey } from '../../agent-delivery/heartbeat-keys.ts';
import { appendSeedMessages } from '../../development/seed-inbox-messages.ts';
import { agentInboxTable, agentLeadsTable, usersTable } from '../../postgres/schema.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { lockServerRow } from '../../servers/server-lock.ts';
import { memberProcedure } from '../server/procedure.ts';
import { assertEvalCleanupAllowed } from './cleanup-eval-chats.ts';

// Test-only heartbeat surfaces for the agent-test kit (specs/heartbeat.md#evals).
// Every procedure is gated like eval chat cleanup: never in production, and only
// from a localhost request.

const idSchema = z.string().min(1);

const startHeartbeatInputSchema = z.object({
    agentId: idSchema,
    kind: z.enum(['daytime', 'nightly']),
    serverId: idSchema,
});

const seedMessagesInputSchema = z.object({
    chatId: idSchema,
    messages: z
        .array(
            z.object({
                /** An Agent id authors as that Agent; omitted authors as the signed-in operator. */
                authorAgentId: idSchema.optional(),
                content: z.string().min(1).max(4000),
                /** How long before now the message was sent; later entries must be newer. */
                minutesAgo: z
                    .number()
                    .int()
                    .min(0)
                    .max(60 * 48),
            })
        )
        .min(1)
        .max(20),
    serverId: idSchema,
});

const operatorTimezoneInputSchema = z.object({
    serverId: idSchema,
    timezone: z.string().min(1).nullable(),
});

const evidenceInputSchema = z.object({
    agentIds: z.array(idSchema).min(1).max(10),
    serverId: idSchema,
});

/**
 * Starts a heartbeat run for one Agent now. It queues exactly what
 * `requestAgentHeartbeat` queues once a slot passes its skip rules (same dedupe key
 * shape, same source) and dispatches, but it bypasses the schedule, the busy skip,
 * the nightly activity gate, and the usage pause.
 */
export const startHeartbeatRoute = memberProcedure
    .input(startHeartbeatInputSchema)
    .mutation(async ({ ctx, input }) => {
        assertHeartbeatTestAllowed(ctx.requestHost, ctx.developmentAuth !== null);
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);

        const now = new Date();
        const localDate = now.toISOString().slice(0, 10);
        // A unique slot per call, so a repeat in one scenario never collides on the key.
        const slot = `${now.toISOString().slice(11, 16)}-dev-${crypto.randomUUID().slice(0, 8)}`;
        const dedupeKey =
            input.kind === 'nightly'
                ? `${dreamDedupeKey(input.agentId, localDate)}:dev-${slot.slice(-8)}`
                : heartbeatDedupeKey(input.agentId, localDate, slot);
        await ctx.hausDb.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            await ctx.agentDelivery.enqueue(tx, {
                agentId: input.agentId,
                chatId: null,
                content: '',
                dedupeKey,
                serverId: input.serverId,
                source: input.kind === 'nightly' ? 'dream' : 'heartbeat',
            });
        });
        await ctx.agentDelivery.dispatchAgent(input.agentId, input.serverId);
        return { dedupeKey, queued: true as const };
    });

/**
 * Appends Messages to a Chat without waking anyone: no inbox rows are queued, so
 * the Agent's live session never sees them. Rows advance the Chat's sequence like
 * the product does.
 */
export const seedHeartbeatMessagesRoute = memberProcedure
    .input(seedMessagesInputSchema)
    .mutation(async ({ ctx, input }) => {
        assertHeartbeatTestAllowed(ctx.requestHost, ctx.developmentAuth !== null);
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        const operator = ctx.member;
        if (!operator) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'No operator for this session.' });
        }

        const now = Date.now();
        // Oldest first: the largest `minutesAgo` leads.
        const ordered = [...input.messages].sort(
            (left, right) => right.minutesAgo - left.minutesAgo
        );
        const nonce = crypto.randomUUID();
        const seeded = await ctx.hausDb.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            return await appendSeedMessages(tx, {
                chatId: input.chatId,
                messages: ordered.map((message, index) => ({
                    ...(message.authorAgentId
                        ? { authorAgentId: message.authorAgentId }
                        : { authorUserId: operator.id }),
                    content: message.content,
                    createdAt: new Date(now - message.minutesAgo * 60_000),
                    nonce: `heartbeat-eval-${nonce}-${index}`,
                })),
                serverId: input.serverId,
            });
        });
        const [user] = await ctx.hausDb
            .select({ displayName: usersTable.displayName, timezone: usersTable.timezone })
            .from(usersTable)
            .where(eq(usersTable.id, operator.id))
            .limit(1);
        return {
            messages: seeded.map((row) => ({ id: row.id, sequence: row.sequence })),
            operator: {
                displayName: user?.displayName ?? null,
                id: operator.id,
                timezone: user?.timezone ?? null,
            },
        };
    });

/** Sets the signed-in operator's IANA zone and returns the previous value, for restoring. */
export const setOperatorTimezoneRoute = memberProcedure
    .input(operatorTimezoneInputSchema)
    .mutation(async ({ ctx, input }) => {
        assertHeartbeatTestAllowed(ctx.requestHost, ctx.developmentAuth !== null);
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        const operator = ctx.member;
        if (!operator) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'No operator for this session.' });
        }
        const [before] = await ctx.hausDb
            .select({ timezone: usersTable.timezone })
            .from(usersTable)
            .where(eq(usersTable.id, operator.id))
            .limit(1);
        await ctx.hausDb
            .update(usersTable)
            .set({ timezone: input.timezone })
            .where(eq(usersTable.id, operator.id));
        return { previous: before?.timezone ?? null };
    });

/**
 * Server-side heartbeat evidence the app API does not expose: the Agents' queued
 * reports (with the run that filed them) and the Server's shared leads.
 */
export const heartbeatEvidenceRoute = memberProcedure
    .input(evidenceInputSchema)
    .mutation(async ({ ctx, input }) => {
        assertHeartbeatTestAllowed(ctx.requestHost, ctx.developmentAuth !== null);
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);

        const reports = await ctx.hausDb
            .select({
                agentId: agentInboxTable.agentId,
                content: agentInboxTable.content,
                createdAt: agentInboxTable.createdAt,
                dedupeKey: agentInboxTable.dedupeKey,
                state: agentInboxTable.state,
            })
            .from(agentInboxTable)
            .where(
                and(
                    eq(agentInboxTable.serverId, input.serverId),
                    inArray(agentInboxTable.agentId, input.agentIds),
                    eq(agentInboxTable.source, 'heartbeat_report'),
                    like(agentInboxTable.dedupeKey, 'heartbeat-report:%')
                )
            )
            .orderBy(desc(agentInboxTable.createdAt));
        const leads = await ctx.hausDb
            .select({
                agentId: agentLeadsTable.agentId,
                anchorMessageId: agentLeadsTable.anchorMessageId,
                createdAt: agentLeadsTable.createdAt,
                doneAt: agentLeadsTable.doneAt,
                finding: agentLeadsTable.finding,
                id: agentLeadsTable.id,
                topic: agentLeadsTable.topic,
            })
            .from(agentLeadsTable)
            .where(
                and(
                    eq(agentLeadsTable.serverId, input.serverId),
                    inArray(agentLeadsTable.agentId, input.agentIds),
                    sql`${agentLeadsTable.createdAt} > now() - interval '1 day'`
                )
            )
            .orderBy(agentLeadsTable.createdAt);
        return {
            leads: leads.map((lead) => ({
                ...lead,
                createdAt: lead.createdAt.toISOString(),
                doneAt: lead.doneAt?.toISOString() ?? null,
            })),
            reports: reports.map((report) => ({
                ...report,
                createdAt: report.createdAt.toISOString(),
            })),
        };
    });

export function assertHeartbeatTestAllowed(
    requestHost: string | null,
    developmentAuthEnabled: boolean
) {
    // The Host header is client-controlled. Only development and test lifecycles
    // provide the fixed development identity, so a hosted non-production
    // deployment cannot be reached by spoofing a localhost Host.
    if (!developmentAuthEnabled) {
        throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Heartbeat test routes are available only in development.',
        });
    }
    assertEvalCleanupAllowed(requestHost, { nodeEnvironment: process.env.NODE_ENV });
}
