import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { remindersTable } from '../../postgres/schema.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { prepareReminderEvent } from '../../reminders/reminder-events.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { lockServerRow } from '../../servers/server-lock.ts';
import { memberProcedure } from '../server/procedure.ts';
import { assertHeartbeatTestAllowed } from './heartbeat-test-routes.ts';

// Test-only: moves a scheduled reminder's fire time to now, so the next scheduler
// tick (every 15 seconds) fires it through the product path. Gated like the other
// heartbeat test routes: never in production, and only from a localhost request.

const fireReminderNowInputSchema = z.object({
    reminderId: z.string().min(1),
    serverId: z.string().min(1),
});

export const fireReminderNowRoute = memberProcedure
    .input(fireReminderNowInputSchema)
    .mutation(async ({ ctx, input }) => {
        assertHeartbeatTestAllowed(ctx.requestHost, ctx.developmentAuth !== null);
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);

        const now = new Date();
        const updated = await ctx.hausDb.transaction(async (tx) => {
            await lockServerRow(tx, input.serverId);
            const [row] = await tx
                .select({ version: remindersTable.version })
                .from(remindersTable)
                .where(
                    and(
                        eq(remindersTable.serverId, input.serverId),
                        eq(remindersTable.id, input.reminderId),
                        eq(remindersTable.status, 'scheduled')
                    )
                )
                .limit(1)
                .for('update');
            if (!row) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'No scheduled reminder with that id on this Server.',
                });
            }
            const [moved] = await tx
                .update(remindersTable)
                .set({ fireAt: now, updatedAt: now, version: row.version + 1 })
                .where(
                    and(
                        eq(remindersTable.serverId, input.serverId),
                        eq(remindersTable.id, input.reminderId)
                    )
                )
                .returning({
                    id: remindersTable.id,
                    ownerAgentId: remindersTable.ownerAgentId,
                    serverId: remindersTable.serverId,
                });
            if (!moved) {
                throw new Error('Failed to move the reminder fire time.');
            }
            return moved;
        });
        publishRealtime(
            prepareReminderEvent({
                action: 'updated',
                ownerAgentId: updated.ownerAgentId,
                reminderId: updated.id,
                serverId: updated.serverId,
            })
        );
        return { fireAt: now.toISOString(), reminderId: updated.id };
    });
