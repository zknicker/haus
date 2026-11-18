import { agentWorkspaceReadInputSchema, workspaceFileContentSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import {
    AgentWorkspaceAccessError,
    readAgentWorkspaceFile,
} from '../../server-agents/agent-workspace.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentWorkspaceFileProcedure = memberProcedure
    .input(agentWorkspaceReadInputSchema)
    .output(workspaceFileContentSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readAgentWorkspaceFile(
                ctx.hausDb,
                ctx.computerConnections,
                ctx.member,
                input
            );
        } catch (cause) {
            if (cause instanceof AgentWorkspaceAccessError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw new TRPCError({
                cause,
                code: 'SERVICE_UNAVAILABLE',
                message:
                    cause instanceof Error ? cause.message : 'The workspace file is unavailable.',
            });
        }
    });
