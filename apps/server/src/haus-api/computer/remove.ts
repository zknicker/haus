import { computerRemovalMoveSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { removeServerComputer } from '../../computers/remove-computer.ts';
import { ComputerSetupDeniedError } from '../../computers/service.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { computerUpdatedTopic, projectUpdatedTopic } from '../../realtime/topics.ts';
import { serverIdSchema } from '../../servers/contracts.ts';
import { announceTaskSessions } from '../../tasks/task-session.ts';
import { memberProcedure } from '../server/procedure.ts';

export const removeComputerProcedure = memberProcedure
    .input(
        z
            .object({
                computerId: z.string().min(1),
                confirmation: z.string().trim(),
                machineMoves: z.array(computerRemovalMoveSchema).max(500).default([]),
                serverId: serverIdSchema,
            })
            .strict()
    )
    .mutation(async ({ ctx, input }) => {
        try {
            const removed = await removeServerComputer(
                ctx.hausDb,
                ctx.agentDelivery,
                ctx.member,
                input
            );
            announceTaskSessions(
                { invocations: ctx.invocations, runner: ctx.runnerLink },
                removed.tasks.sessions
            );
            publishRealtime(removed.tasks.events);
            void ctx.postCommitWork.wakeAgents(ctx.agentDelivery, removed.tasks.wakes);
            ctx.computerConnections.disconnectComputer(removed.computerId);
            await ctx.agentDelivery.commitMachineSteps(removed.moved);
            computerUpdatedTopic.announce({
                computerId: input.computerId,
                serverId: input.serverId,
            });
            for (const projectId of removed.projectIds) {
                projectUpdatedTopic.announce({ projectId, serverId: input.serverId });
            }
            return { computerId: removed.computerId };
        } catch (cause) {
            if (cause instanceof ComputerSetupDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw new TRPCError({
                cause,
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Computer could not be removed. Try again.',
            });
        }
    });
