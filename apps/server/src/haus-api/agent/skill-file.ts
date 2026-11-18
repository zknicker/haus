import {
    agentSkillFileDeleteInputSchema,
    agentSkillFileReadInputSchema,
    agentSkillFileSchema,
    agentSkillFileUpdateInputSchema,
} from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
    AgentSkillFileAccessError,
    deleteAgentSkillFile,
    readAgentSkillFile,
    updateAgentSkillFile,
} from '../../server-agents/agent-skill-file.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentSkillFileProcedure = memberProcedure
    .input(agentSkillFileReadInputSchema)
    .output(agentSkillFileSchema)
    .query(({ ctx, input }) =>
        withSkillFileError(() =>
            readAgentSkillFile(ctx.hausDb, ctx.computerConnections, ctx.member, input)
        )
    );

export const updateAgentSkillFileProcedure = memberProcedure
    .input(agentSkillFileUpdateInputSchema)
    .output(agentSkillFileSchema)
    .mutation(({ ctx, input }) =>
        withSkillFileError(() =>
            updateAgentSkillFile(ctx.hausDb, ctx.computerConnections, ctx.member, input)
        )
    );

export const deleteAgentSkillFileProcedure = memberProcedure
    .input(agentSkillFileDeleteInputSchema)
    .output(z.object({ deleted: z.literal(true) }).strict())
    .mutation(({ ctx, input }) =>
        withSkillFileError(() =>
            deleteAgentSkillFile(ctx.hausDb, ctx.computerConnections, ctx.member, input)
        )
    );

async function withSkillFileError<T>(operation: () => Promise<T>) {
    try {
        return await operation();
    } catch (cause) {
        if (cause instanceof AgentSkillFileAccessError) {
            throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
        }
        const message = cause instanceof Error ? cause.message : 'The Agent skill is unavailable.';
        throw new TRPCError({
            cause,
            code: message.includes('changed since you opened') ? 'CONFLICT' : 'SERVICE_UNAVAILABLE',
            message,
        });
    }
}
