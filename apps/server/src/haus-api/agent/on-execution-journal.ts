import { agentExecutionJournalChangeSchema, agentExecutionJournalInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import type { HausDatabase } from '../../postgres/connection.ts';
import {
    AgentExecutionJournalAccessError,
    requireExecutionEvidenceComputer,
} from '../../server-agents/agent-execution-journal.ts';
import { subscribeToExecutionJournalChanges } from '../../server-agents/execution-journal-changes.ts';
import type { HausUser } from '../../users/haus-user.ts';
import { memberProcedure } from '../server/procedure.ts';

/**
 * Tells an open turn view that its run's journal changed, so it re-reads
 * `agent.executionJournal` instead of polling. Authorized like that read.
 */
export const onAgentExecutionJournalProcedure = memberProcedure
    .input(agentExecutionJournalInputSchema)
    .use(async ({ ctx, input, next }) => {
        await authorize(ctx.hausDb, ctx.member, input);
        return await next();
    })
    .subscription(async function* ({ ctx, input, signal }) {
        for await (const change of subscribeToExecutionJournalChanges(signal)) {
            if (
                change.serverId !== input.serverId ||
                change.agentId !== input.agentId ||
                change.runId !== input.runId
            ) {
                continue;
            }
            await authorize(ctx.hausDb, ctx.member, input);
            yield agentExecutionJournalChangeSchema.parse({
                agentId: change.agentId,
                runId: change.runId,
            });
        }
    });

async function authorize(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
) {
    try {
        await requireExecutionEvidenceComputer(db, member, input);
    } catch (cause) {
        if (cause instanceof AgentExecutionJournalAccessError) {
            throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
        }
        throw cause;
    }
}
