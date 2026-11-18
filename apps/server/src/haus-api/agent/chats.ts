import { agentDetailInputSchema, chatListSchema } from '@haus/api';
import { listAgentChats } from '../../server-agents/list-agent-chats.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentChatsProcedure = memberProcedure
    .input(agentDetailInputSchema)
    .output(chatListSchema)
    .query(({ ctx, input }) => listAgentChats(ctx.hausDb, ctx.member, input));
